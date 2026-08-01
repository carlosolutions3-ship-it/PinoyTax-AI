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

## 5. Frontend on Vercel (alternative to the Docker build above)

`apps/web` can deploy on Vercel instead of the Docker image in §4, while `apps/api`/`worker` still deploy via Docker (§6). This is a plain npm-workspaces monorepo, and Vercel's default **Root Directory** is the repository root — if it isn't explicitly changed in the dashboard, Vercel's zero-config detection runs the root `package.json`'s `build` script, which chains **both** workspaces (`npm run build --workspace=apps/api && npm run build --workspace=apps/web`).

That root script doesn't just waste a build — it reliably **fails**. `apps/api`'s build requires a fully generated `@prisma/client` (it imports generated enums like `FilingStatus` and relies on generated Prisma types throughout). A plain `npm install` run from the monorepo root triggers `@prisma/client`'s own `postinstall` hook, but that hook can't reliably locate `apps/api/prisma/schema.prisma` from a root-level install in an npm-workspaces layout — this is a documented Prisma-in-monorepos limitation, not specific to Vercel. It silently falls back to a stub client instead of erroring, so `nest build` then fails downstream with ~60 TypeScript errors (`Module '"@prisma/client"' has no exported member 'FilingStatus'`, `Property '$queryRawUnsafe' is missing`, and cascading implicit-`any` errors on every Prisma-typed callback). This was confirmed by reproducing the exact failure locally: a clean `rm -rf node_modules && npm install && npm run build` from the repo root fails with that error set every time. The Docker build in §4 doesn't hit this because its `deps` stage runs `npx prisma generate` explicitly, from inside `apps/api`, before `nest build` — the root workspace script has no equivalent step.

**Fix — a root-level `vercel.json`** (committed at the repository root, not just `apps/web/vercel.json`) pins the install/build commands so Vercel never runs the ambiguous root `build` script and never touches `apps/api`, regardless of what Root Directory is set to in the dashboard:

```json
{
  "framework": "nextjs",
  "installCommand": "npm install",
  "buildCommand": "npm run build --workspace=apps/web",
  "outputDirectory": "apps/web/.next"
}
```

This is the primary, dashboard-independent fix and is verified locally by running the exact commands above from a clean install — `apps/web` builds to completion without `apps/api`'s `nest build` ever running. `apps/web/vercel.json` (with its `cd ../..` variants) is left in place as a second, redundant safeguard for the alternate configuration where someone sets Root Directory to `apps/web` directly — either configuration now produces a working, `apps/api`-free build.

**Vercel project settings:**

| Setting | Value |
|---|---|
| Root Directory | Leave blank / `.` (repository root) — the default. Do **not** point it at `apps/web` unless you also remove the root `vercel.json`, since Vercel only reads one `vercel.json`, the one inside Root Directory. |
| Framework Preset | Next.js (auto-detected from `apps/web`'s dependencies via `outputDirectory`) |
| Install Command | *(from root `vercel.json`)* `npm install` |
| Build Command | *(from root `vercel.json`)* `npm run build --workspace=apps/web` |
| Output Directory | *(from root `vercel.json`)* `apps/web/.next` — required because Root Directory is the repo root, not `apps/web`, so Vercel can't infer it automatically the way it would for a plain single-app repo. Unrelated to `next.config.js`'s `output: 'standalone'`, which only affects the Docker build in §4. |

`apps/api`'s *source* is still present after install (npm needs every workspace's `package.json` to resolve the lockfile), but its `build`/`start` scripts are never invoked — confirm this by checking the Vercel build log has no `nest build` step.

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
