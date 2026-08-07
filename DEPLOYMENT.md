# Deployment Guide

This document covers deploying PinoyTax AI to a production environment. For local development setup, see `INSTALL.md`. For backing up and restoring the database and document vault, see `BACKUP_RESTORE.md`.

## 1. Architecture recap

**Render is the supported production platform** — all pieces below deploy there via the `render.yaml` Blueprint at the repo root (see §5). Nothing in the app assumes Render specifically (it's a plain multi-stage Dockerfile setup), so any Docker-capable host works too (§4/§6 cover that path).

Render was chosen after evaluating Railway: Railway's Hobby plan hard-caps a **workspace** (not just a project) at 5 services total, and this app needs 6 (api, worker, web, Postgres, Redis, RabbitMQ) — confirmed by actually hitting the "Free plan resource provision limit exceeded" error on Railway with a second, empty project, which Railway's own agent tooling initially misdiagnosed as a per-project limit before a follow-up check found it was workspace-wide. Render's free tier has no equivalent service-count ceiling. `apps/api` and `apps/web` still deployed and verified healthy on Railway during that evaluation (Postgres/Redis/RabbitMQ connected, `/health/ready` returning 200) before the migration to Render — see git history for `apps/web/railway.json` (removed) if that path is ever revisited.

- `apps/api` — NestJS backend, deployed as **two separate services** from the same image/Dockerfile:
  - `api` — HTTP server (`node dist/main.js`, chained after `prisma migrate deploy`)
  - `worker` — background job processor, no HTTP server (`node dist/worker.js`)
- `apps/web` — Next.js frontend (standalone output), its own Dockerfile, deployed as a third service
- PostgreSQL 15+ and Redis 7+ — Render-managed (Render Postgres, Render Key Value)
- RabbitMQ 3.13+ — **not a Render product**; provisioned externally (CloudAMQP free tier recommended, §5.4)
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

## 5. Render deployment (recommended production path)

PinoyTax AI deploys via the `render.yaml` Blueprint at the repo root: **New → Blueprint** in the Render dashboard, point it at this GitHub repo/branch, and Render provisions `pinoytax-postgres`, `pinoytax-redis`, `pinoytax-api`, `pinoytax-worker`, and `pinoytax-web` in one pass from the settings baked into that file. RabbitMQ is the one piece Render doesn't offer — §5.4 covers provisioning it externally.

### 5.1 Data services

`pinoytax-postgres` and `pinoytax-redis` are declared directly in `render.yaml` (Render-managed Postgres and Key Value/Redis) — no manual setup needed beyond accepting the Blueprint. Two things to verify in the dashboard once created, since Render's free-tier policies for these have changed over time and may differ from what's current when you deploy:

- **Postgres free plan expiry**: Render's free Postgres instances are commonly time-limited (historically ~30-90 days) before requiring an upgrade to a paid plan or the data is deleted. Check the instance's expiry date in the dashboard immediately after provisioning and plan the upgrade before it lapses — this is a real data-loss risk, not just a feature limitation.
- **Redis free-tier availability**: confirm a free plan is actually offered for new Key Value instances when you deploy. If it isn't, Upstash's free Redis tier is a drop-in alternative (TLS `REDIS_URL`, same as Render's) — swap the `pinoytax-redis` service block for a `sync: false` `REDIS_URL` var pointed at it.

### 5.2 `pinoytax-api` and `pinoytax-worker` services

Both build from `apps/api/Dockerfile` (`render.yaml`'s `dockerContext: ./apps/api`), same image, different `dockerCommand`:

| Setting | `pinoytax-api` | `pinoytax-worker` |
|---|---|---|
| Type | Web Service | Background Worker |
| Dockerfile Path | `./apps/api/Dockerfile` | `./apps/api/Dockerfile` |
| Docker Command | `sh -c "npx prisma migrate deploy && node dist/main.js"` | `node dist/worker.js` |
| Health Check Path | `/health/ready` | *(not applicable — Background Workers aren't HTTP-exposed on Render)* |

**Migrations** run via `pinoytax-api`'s `dockerCommand` chain above on every boot (idempotent — reports "No pending migrations to apply" once applied), the same pattern proven on Railway: a separate pre-deploy-command mechanism is one more moving part to trust, and chaining into the command Render *always* runs to completion sidesteps that.

**Seeding the platform admin** happens automatically on every `pinoytax-api` boot (`apps/api/src/main.ts`), guarded by `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` (`render.yaml` declares both as `sync: false` — set the real values in the Render dashboard after the Blueprint deploys). Fully idempotent (`upsert`), safe to leave set permanently. Reference-data seeding (roles, permissions, tax rules, form templates) still needs a one-time `npm run prisma:seed` from a full checkout with devDependencies, per §3 — it isn't part of the boot-time hook.

### 5.3 `pinoytax-web` service

Builds from `apps/web/Dockerfile`. `NEXT_PUBLIC_API_URL` is set in `render.yaml` to `https://pinoytax-api.onrender.com/v1` — **Render service URLs are deterministic** (`https://<service-name>.onrender.com`, no random suffix like Railway), so this is correct without any post-deploy lookup, as long as you keep the service named `pinoytax-api` when accepting the Blueprint. Render passes service env vars as Docker build args when the Dockerfile declares a matching `ARG` (it does here), the same mechanism Railway uses — verify it actually got inlined after the first deploy by fetching the built page's JS chunks and confirming the literal URL appears rather than a `localhost:3001` fallback (see `apps/web/src/lib/api-client.ts`); a silent fallback manifests as a generic "Unable to log in" with no useful error.

### 5.4 Environment variables, RabbitMQ, and internal networking

`render.yaml` wires `DATABASE_URL` and `REDIS_URL` via `fromDatabase`/`fromService` references, and shares `JWT_ACCESS_SECRET` between `pinoytax-api` (auto-generated via `generateValue: true`) and `pinoytax-worker` (`fromService.envVarKey`) — these need no manual setup.

**RabbitMQ is not a Render product.** Provision it externally and set `RABBITMQ_URL` (declared `sync: false` on both `pinoytax-api` and `pinoytax-worker`) by hand:

1. Sign up at [cloudamqp.com](https://www.cloudamqp.com) and create a free "Little Lemur" instance (free tier: ~1M messages/month, 20 connections, single node — no HA, so treat it as sufficient for launch/low-volume use, not a guarantee under sustained load).
2. Copy the instance's AMQP URL (format: `amqps://user:pass@host/vhost`) from the CloudAMQP dashboard.
3. Paste it into `RABBITMQ_URL` on **both** `pinoytax-api` and `pinoytax-worker` in the Render dashboard (they must match — both connect to the same exchange for domain events to flow between them).
4. Redeploy both services. Check the deploy log for `Connected to RabbitMQ and asserted domain-events exchange` on each — if it's missing, the URL is wrong or the CloudAMQP instance isn't reachable (note `amqps://`, not `amqp://` — CloudAMQP requires TLS on its default port).

If a project already has RabbitMQ hosted elsewhere (self-managed, another cloud), any reachable AMQP 0-9-1 URL works here — CloudAMQP is a recommendation, not a hard dependency.

Also set on `pinoytax-api` only (already `sync: false` placeholders in `render.yaml`): `ANTHROPIC_API_KEY` (AI assistant feature), `S3_*` (document vault — also read by `pinoytax-worker`, add there too if using), `SMTP_*` (transactional email). None of these are required for the app to boot (only `DATABASE_URL`/`JWT_ACCESS_SECRET` are Joi-validated as required) — those features are simply inert until configured.

### 5.5 CORS and cross-site cookies

`pinoytax-api`'s CORS origin is `APP_WEB_URL`, matched as an **exact string** against the browser's `Origin` header (trimmed/trailing-slash-stripped in code, but still exact otherwise) — `render.yaml` sets it to `https://pinoytax-web.onrender.com` with no path or trailing slash.

`pinoytax-web` and `pinoytax-api` sit on **different `*.onrender.com` subdomains**, and that wildcard domain is on the Public Suffix List (like `vercel.app`/`up.railway.app` — every tenant's subdomain is deliberately treated as its own "site" to stop cross-tenant cookie leakage). This means the refresh-token cookie is genuinely cross-site, not just cross-origin — `apps/api/src/modules/identity/auth.controller.ts` already sets `SameSite=None; Secure` whenever `NODE_ENV=production` for exactly this reason; don't "simplify" it back to `Strict` because both services happen to share `onrender.com`.

If you later put a custom domain in front of `pinoytax-web` (e.g. `app.yourdomain.com`) and keep `pinoytax-api` on its Render subdomain (or vice versa), the cross-site conclusion still holds — different registrable domains entirely.

### 5.6 Verifying a deployment

```bash
curl -s https://pinoytax-api.onrender.com/health/ready
# {"data":{"status":"ok","info":{"database":{"status":"up"},"redis":{"status":"up"}},...}}

curl -s -i -X POST https://pinoytax-api.onrender.com/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"<seed-admin-email>","password":"<seed-admin-password>"}'
# HTTP/2 200, a real accessToken in the body, and a Set-Cookie with SameSite=None; Secure
```

Check the `pinoytax-api` deploy log for `Connected to RabbitMQ and asserted domain-events exchange` (confirms §5.4's CloudAMQP URL is correct) and `Platform admin ensured for <email>` (confirms the boot-time seed from §5.2 ran). Check `pinoytax-worker`'s log for `PinoyTax AI worker process started — listening for queued jobs` and its own `Connected to RabbitMQ`/`Connected to PostgreSQL via Prisma` lines. For `pinoytax-web`, confirm the deployed page loads at `https://pinoytax-web.onrender.com/login` and that its compiled JS contains the real API URL, not `localhost:3001` (§5.3).

**Free-tier cold starts**: Render's free Web Services spin down after a period of inactivity and take on the order of tens of seconds to spin back up on the next request — expect the first request after idle time (including automated health checks) to be slow, not broken. This applies to `pinoytax-api` and `pinoytax-web`; confirm current behavior for Background Workers on the free tier in the Render dashboard, since Render's spin-down policy differs by service type and changes over time.

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
