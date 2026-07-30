# Deployment Guide

This document covers deploying PinoyTax AI to a production environment. For local development setup, see `INSTALL.md`. For backing up and restoring the database and document vault, see `BACKUP_RESTORE.md`.

## 1. Architecture recap

- `apps/api` — NestJS backend, deployed as **two separate processes** from the same image:
  - `api` — HTTP server (`node dist/main.js`)
  - `worker` — background job processor, no HTTP server (`node dist/worker.js`)
- `apps/web` — Next.js frontend (standalone output)
- PostgreSQL 15+, Redis 7+, RabbitMQ 3.13+ as stateful dependencies
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

Review each migration file once against your actual PostgreSQL version and hosting provider (some managed Postgres providers restrict `CREATE ROLE` or superuser-only operations like enabling certain extensions) before running `migrate deploy` for the first time.

Seed reference data (roles, permissions, tax rules, form templates) after migrations:

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

## 5. Frontend on Vercel (alternative to the Docker build above)

`apps/web` can deploy on Vercel instead of the Docker image in §4, while `apps/api`/`worker` still deploy via Docker (§6) — this is a plain npm-workspaces monorepo, so Vercel's zero-config detection at the repository root will otherwise try to run the root `package.json`'s `build` script, which builds **both** workspaces (`npm run build --workspace=apps/api && npm run build --workspace=apps/web`) and fails or wastes a build on the NestJS API, which Vercel doesn't run anyway. `apps/web/vercel.json` fixes this by pinning an explicit, workspace-scoped install/build command — it only takes effect once **Root Directory** is set correctly in the project settings below.

**Vercel project settings:**

| Setting | Value |
|---|---|
| Root Directory | `apps/web` |
| Framework Preset | Next.js (auto-detected) |
| Install Command | *(from `apps/web/vercel.json`)* `cd ../.. && npm install` |
| Build Command | *(from `apps/web/vercel.json`)* `cd ../.. && npm run build --workspace=apps/web` |
| Output Directory | Leave blank/default — Vercel's Next.js builder manages this itself; it does not use `next.config.js`'s `output: 'standalone'` (that setting is only consumed by the Docker build in §4) |

With Root Directory set to `apps/web`, Vercel detects the root `package.json`'s `workspaces` field and runs the install step from the repository root (needed to resolve the npm workspace correctly) before `cd`-ing into `apps/web` for the build — `apps/web/vercel.json`'s explicit `cd ../..` in both commands makes this independent of that auto-detection rather than relying on it silently. `apps/api`'s *source* is still present during install (npm needs every workspace's `package.json` to resolve the lockfile), but its `build`/`start` scripts are never invoked — confirm this by checking the Vercel build log has no `nest build` step.

**Required environment variable** (Vercel dashboard → Project → Settings → Environment Variables, set for Production *and* Preview):

| Variable | Value | Notes |
|---|---|---|
| `NEXT_PUBLIC_API_URL` | `https://api.yourdomain.com/v1` | Baked into the client bundle at build time (Next.js only exposes `NEXT_PUBLIC_*` to the browser) — changing it requires a new deploy, it cannot be hot-swapped at runtime. Point it at wherever `apps/api` is actually running (§6/§4), including the `/v1` prefix. |

No other environment variables are read by the frontend build or runtime — `apps/web/src/lib/api-client.ts` is the only `process.env` reference in the app.

**On the API side**, once the frontend has a real Vercel URL, set `APP_WEB_URL` (§2 item 7) on `apps/api` to that URL so CORS and cookie scoping allow it, and confirm CORS is not left wide-open to `*` in production.

**Optional — skip rebuilds when only the backend changed**: Vercel's Project Settings → Git → "Ignored Build Step" accepts a shell command; a common pattern for non-Turborepo monorepos is `git diff --quiet HEAD^ HEAD -- apps/web` (exit 0 = skip, exit 1 = build — this is the opposite of normal exit-code intuition, and matches `git diff --quiet`'s own exit codes exactly, so no wrapping is needed). This was deliberately **not** committed into `apps/web/vercel.json` as an `ignoreCommand`: `HEAD^` fails on a shallow clone or a repo with only one commit, which would silently skip every build until fixed — configure it in the dashboard only after confirming Vercel's git integration uses a deep-enough clone.

## 6. Kubernetes deployment shape (recommended)

Per the Phase 1 architecture, deploy these as **separate scalable units**:

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
