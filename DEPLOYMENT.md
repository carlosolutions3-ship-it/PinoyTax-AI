# Deployment Guide

This document covers deploying PinoyTax AI to a production environment. For local development setup, see `INSTALL.md`. For backing up and restoring the database and document vault, see `BACKUP_RESTORE.md`.

## 1. Architecture recap

**Railway is the supported production platform** — all five pieces below deploy there as separate services in one project (see §5). Nothing in the app assumes Railway specifically (it's a plain multi-stage Dockerfile setup), so any Docker-capable host works too (§4/§6 cover that path), but Railway is what's actually verified end-to-end.

- `apps/api` — NestJS backend, deployed as **two separate services** from the same image/Dockerfile:
  - `api` — HTTP server (`node dist/main.js`)
  - `worker` — background job processor, no HTTP server (`node dist/worker.js`)
- `apps/web` — Next.js frontend (standalone output), its own Dockerfile, deployed as a third service
- PostgreSQL 15+, Redis 7+, RabbitMQ 3.13+ as stateful dependencies — on Railway, deployed from the official templates with a persistent volume each
- S3-compatible object storage for the document vault
- SMTP provider for transactional email

## 2. Pre-deployment checklist

Before deploying to any environment beyond local Docker Compose:

1. **Generate real secrets.** `JWT_ACCESS_SECRET` must be a high-entropy random value (`openssl rand -hex 32`), unique per environment. Never reuse the `.env.example` placeholder values.
2. **Set `NODE_ENV=production`.**
3. **Provision managed infrastructure** rather than the Docker Compose containers: managed Postgres (with automated backups and point-in-time recovery), managed Redis, managed RabbitMQ (or a hosted equivalent), and an S3 bucket with versioning and server-side encryption enabled.
4. **Create the `pinoytax_app` database role** with a strong, generated password (the migration in `prisma/migrations/20240101000002_audit_append_only` creates it with a placeholder password — override this before running migrations against production, either by editing the migration's `CREATE ROLE` statement pre-deploy or by rotating the password immediately after).
5. **Confirm the database connection string points at `pinoytax_app`**, not a superuser role, so the append-only audit-log guarantee and (future) RLS enforcement actually apply to application traffic.
6. **Set up TLS termination** in front of the API (load balancer or ingress) — the app itself does not terminate TLS.
7. **Configure `APP_WEB_URL`** to the real frontend origin, since it's used for CORS, cookie scoping, and email links.

## 3. Database migrations

Migrations are hand-authored SQL (see `apps/api/prisma/migrations/`) rather than `prisma migrate dev`-generated, since this repository was built without a live database connection. Before the first production deploy:

```bash
cd apps/api
npx prisma migrate deploy
npx prisma generate
```

`prisma` (the CLI, not just `@prisma/client`) is a production dependency specifically so this command also works run directly from the deployed `apps/api` image — e.g. as a Kubernetes `initContainer`/one-off `Job` or an ECS one-off task using the same image that serves traffic, a common pattern for this exact command. `prisma/seed.ts` below is different: it deliberately stays a `ts-node`/devDependency-only path, since seeding is a one-time bootstrap step meant to run from a full checkout or CI job, not the hardened runtime image (which doesn't carry `ts-node` or a TypeScript compiler).

Review each migration file once against your actual PostgreSQL version and hosting provider (some managed Postgres providers restrict `CREATE ROLE` or superuser-only operations like enabling certain extensions) before running `migrate deploy` for the first time.

Seed reference data (roles, permissions, tax rules, form templates, firm roles) after migrations, from a machine/CI job with the full repo and devDependencies installed:

```bash
SEED_ADMIN_EMAIL=admin@yourcompany.com SEED_ADMIN_PASSWORD='<strong-password>' npm run prisma:seed
```

Omit `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` to skip creating a platform admin account (you can promote a user later via `isPlatformAdmin` directly in the database).

**Before relying on seeded tax rates or filing deadline rules for real compliance work**, have an accountant or tax counsel review every row in `tax_engine.tax_rules` / `tax_rates_history` and the due-date logic in `ComplianceService.generateFilingDeadlines` — both are explicitly flagged in code as illustrative starting points, not certified values.

## 4. Container builds

```bash
# API + worker (same image, different entrypoint)
docker build -t pinoytax-api:latest ./apps/api

# Frontend
docker build -t pinoytax-web:latest ./apps/web \
  --build-arg NEXT_PUBLIC_API_URL=https://api.yourdomain.com/v1
```

Push to your registry and deploy via your orchestrator of choice (Kubernetes, ECS, etc.). The provided `docker-compose.yml` is intended for local development and staging smoke-tests, not as a production deployment mechanism.

## 5. Railway deployment (recommended production path)

PinoyTax AI runs as **five services in one Railway project**: `Postgres`, `Redis`, `RabbitMQ` (each an official template with a persistent volume), plus `api`, `worker`, and `web` built from this GitHub repo. This section documents exact settings — every gotcha below was hit and root-caused running a real deployment, not theorized.

### 5.1 Data services

Add `Postgres`, `Redis`, and `RabbitMQ` from Railway's template marketplace (not raw Docker images by hand) — the templates come with a persistent volume already attached, which a hand-rolled service does not get automatically. **A Railway service can only have one volume**; if you experiment and end up with two, remove the extra one before deploying or the config will be rejected.

### 5.2 `api` and `worker` services

Both deploy from this repo, `main` branch, and share the same Dockerfile:

| Setting | `api` | `worker` |
|---|---|---|
| Root Directory | `apps/api` | `apps/api` |
| Builder | Dockerfile | Dockerfile |
| Dockerfile Path | `apps/api/Dockerfile` | `apps/api/Dockerfile` |
| Start Command | `sh -c "npx prisma migrate deploy && node dist/main.js"` | `node dist/worker.js` |
| Healthcheck Path | `/health/ready` | *(leave unset — worker has no HTTP server)* |

**The Dockerfile Path gotcha**: even with Root Directory set to `apps/api`, Railway's `dockerfilePath` is resolved **relative to the repository root**, not the Root Directory — set it to `Dockerfile` alone and Railway silently falls back to its own Railpack buildpack auto-detection instead of erroring, which builds via `npm run build` and then runs `npm run start` (`nest start`, a dev-mode command that fails at runtime with `Cannot find module '/app/dist/main'` because devDependencies like `@nestjs/cli` aren't in the production `npm ci --omit=dev` layer). The build *looks* fine in the log (`Detected Next.js/Node version`, `npm run build` succeeds) right up until the container crash-loops. Always use the full `apps/api/Dockerfile` path and confirm the build log shows `[internal] load build definition from apps/api/Dockerfile`, not `[railpack] ...` lines.

**Migrations**: run via the `api` service's Start Command shell chain above, which reliably runs `prisma migrate deploy` before every boot (idempotent — instantly reports "No pending migrations to apply" once applied). A separate Railway "Pre-Deploy Command" configuration was tried first and proved unreliable in practice (the configured command was observed reverting between deploys, and its execution window got cut short before finishing) — chaining migration into the actual Start Command avoided that entirely, since it's the one thing every deploy reliably runs to completion.

**Seeding the platform admin**: do **not** rely on a separate seed command/job on Railway, for the same reliability reason as migrations above. Instead, `apps/api/src/main.ts` seeds/promotes the platform admin **automatically on every boot** of the `api` service, guarded by `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` and fully idempotent (`upsert`, safe to leave set permanently). Set those two variables on the `api` service and the admin account exists after the next deploy — no manual step required. (Reference-data seeding — roles, permissions, tax rules, form templates — still needs a one-time run of `npm run prisma:seed` from a full checkout with devDependencies, per §3, since it isn't part of the boot-time hook.)

### 5.3 `web` service

`apps/web/railway.json` (config-as-code, picked up automatically once Root Directory is set to `apps/web`) already pins the build/deploy settings below, so creating the service only requires setting Root Directory, the env var, and generating a domain — the rest applies itself:

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Builder | Dockerfile |
| Dockerfile Path | `apps/web/Dockerfile` (repo-root-relative — same gotcha as §5.2) |
| Start Command | *(leave unset — the Dockerfile's own `CMD` is correct here)* |
| Healthcheck Path | `/login` |

`NEXT_PUBLIC_API_URL` must be a **service variable on `web`** set to the `api` service's public domain plus `/v1` (e.g. `https://api-production-xxxx.up.railway.app/v1`) — Railway makes service variables available as Docker build args, and `apps/web/Dockerfile` already declares `ARG NEXT_PUBLIC_API_URL`, so no Dockerfile change is needed. Verify it actually got inlined after deploying: fetch the built page and its JS chunks, and confirm the literal URL appears in the compiled bundle rather than a runtime `process.env` lookup (the latter means the variable wasn't available at build time and the app silently fell back to `http://localhost:3001/v1`, which will never work in production and manifests as a generic "Unable to log in" with no useful error — see `apps/web/src/lib/api-client.ts`).

### 5.4 Environment variables and internal networking

Use Railway's reference-variable syntax (`${{ServiceName.VARIABLE}}`) instead of copy-pasting connection strings — it stays correct if a service's credentials ever rotate:

```
# On api and worker:
DATABASE_URL=${{Postgres.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
RABBITMQ_URL=amqp://${{RabbitMQ.RABBITMQ_DEFAULT_USER}}:${{RabbitMQ.RABBITMQ_DEFAULT_PASS}}@${{RabbitMQ.RAILWAY_PRIVATE_DOMAIN}}:5672/${{RabbitMQ.RABBITMQ_DEFAULT_VHOST}}
```

**The RabbitMQ port gotcha**: RabbitMQ's own `RAILWAY_SERVICE_RABBITMQ_URL` convenience variable resolves empty in practice — build the URL from the individual pieces above instead. And do **not** use RabbitMQ's `PORT` variable for this: on the `rabbitmq:4-management` image, `PORT` is Railway's binding for the **management UI** (15672), not AMQP. The AMQP listener is always `5672` — confirmed directly from the RabbitMQ service's own boot log (`started TCP listener on [::]:5672`). Using the wrong port doesn't fail loudly; `amqplib` reports `Socket closed abruptly during opening handshake`, and the app still boots and serves traffic with messaging silently degraded (background jobs / domain events stop flowing).

Also set on `api` and `worker`: `NODE_ENV=production`, `JWT_ACCESS_SECRET` (a real `openssl rand -hex 32` value, not the `.env.example` placeholder), `APP_WEB_URL` (the `web` service's public domain — see §5.5 for why this must be exact), plus `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` on `api` only (§5.2). Set `WORKER_PROCESS=true` on `worker` only, so its shared Dockerfile `HEALTHCHECK` (relevant to Docker Compose/Swarm-style runs, not Railway, but harmless either way) knows not to probe an HTTP port the worker never listens on.

### 5.5 CORS and cross-site cookies

`api`'s CORS origin is `APP_WEB_URL`, matched as an **exact string** against the browser's `Origin` header (trimmed/trailing-slash-stripped in code, but still exact otherwise) — it must be the `web` service's domain with no path or trailing slash, e.g. `https://web-production-xxxx.up.railway.app`.

Even with both services on Railway, `web` and `api` sit on **different `*.up.railway.app` subdomains**, and that wildcard domain is on the Public Suffix List (like `vercel.app`/`herokuapp.com` — every tenant's subdomain is deliberately treated as its own "site" to stop cross-tenant cookie leakage). This means the refresh-token cookie is still genuinely cross-site, not just cross-origin — `apps/api/src/modules/identity/auth.controller.ts` already sets `SameSite=None; Secure` whenever `NODE_ENV=production` for exactly this reason; no further change needed, just don't "simplify" it back to `Strict` because both services happen to share `railway.app`.

If you later put a custom domain in front of `web` (e.g. `app.yourdomain.com`) and keep `api` on its Railway subdomain (or vice versa), the cross-site conclusion still holds — different registrable domains entirely.

### 5.6 Verifying a deployment

```bash
curl -s https://<api-domain>/health/ready
# {"data":{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},...}}

curl -s -i -X POST https://<api-domain>/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seed-admin-email>","password":"<seed-admin-password>"}'
# HTTP/2 200, a real accessToken in the body, and a Set-Cookie with SameSite=None; Secure
```

Check the `api` deploy log for `Connected to RabbitMQ and asserted domain-events exchange` (confirms the port fix from §5.4 actually took) and `Platform admin ensured for <email>` (confirms the boot-time seed from §5.2 ran). For `web`, confirm the deployed page loads and that its compiled JS contains the real API URL, not `localhost:3001` (§5.3).

## 6. Kubernetes deployment shape (alternative to Railway)

Railway (§5) is the supported, verified production path. If you're self-hosting on Kubernetes instead, deploy these as **separate scalable units**:

| Deployment | Image | Command | Replicas | Notes |
|---|---|---|---|---|
| `pinoytax-api` | `pinoytax-api:latest` | `node dist/main.js` | 2+ | Behind a Service + Ingress; readiness probe `GET /health/ready`, liveness probe `GET /health/live` |
| `pinoytax-worker` | `pinoytax-api:latest` | `node dist/worker.js` | 1+ | No Service/ports needed; scale based on queue depth |
| `pinoytax-web` | `pinoytax-web:latest` | (default) | 2+ | Behind a Service + Ingress |

Both `api` and `worker` share the same image and `DATABASE_URL`/`REDIS_URL`/`RABBITMQ_URL`/`ANTHROPIC_API_KEY`/`SMTP_*`/`S3_*` secrets — inject via your orchestrator's secret management (Kubernetes Secrets + an external secrets operator, AWS Secrets Manager, etc.), never as plain ConfigMap values for anything sensitive.

## 7. Health checks

- `GET /health/live` — process liveness only, no dependency checks. Use for liveness probes.
- `GET /health/ready` — checks Postgres and Redis connectivity. Use for readiness probes.
- `GET /health` — full check including memory heap usage. Use for external uptime monitoring, not orchestrator probes (slower, more dependency-sensitive).

## 8. Zero-downtime deploys

- Run `prisma migrate deploy` as a separate step **before** rolling out new application code, and ensure migrations are backward-compatible with the previous code version (additive columns/tables, no destructive renames in the same release) so a mid-rollout mix of old/new pods never breaks.
- Use rolling updates (Kubernetes default) or blue-green, cutting traffic over only after the new revision's readiness probe passes.

## 9. Observability

- Structured JSON logs (Pino) to stdout — ship to your log aggregator (ELK, Loki, CloudWatch Logs, etc.) via your platform's standard container log collection; no additional shipping code is built into the app.
- `/docs` (Swagger UI) is enabled unconditionally in this build — **restrict access to it in production** (network policy, auth-gated ingress rule, or disable the `setupSwagger` call for the production build) since it exposes your full API surface.
- No APM/tracing vendor is wired in; add OpenTelemetry instrumentation if your organization requires distributed tracing before a high-stakes production launch.

## 10. Rollback

Since migrations are forward-only SQL files, rollback of a bad deploy is: revert the application image/deployment to the previous revision. Do not attempt to hand-write down-migrations for this schema without a DBA review — several migrations (RLS, audit append-only grants) are structural and not trivially reversible.
