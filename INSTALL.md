# Installation & Local Development Setup

## Prerequisites

- Node.js 20+
- npm 10+
- Docker and Docker Compose (for Postgres, Redis, RabbitMQ)

> **Note on this repository's state:** this codebase was generated and reviewed in a sandboxed environment without network access, so `npm install` has never actually been run against it here, and nothing has been compiled or executed. The steps below are the real, standard steps to bring it up — treat the first run as your verification pass, and expect to fix any dependency-version mismatches that `npm install` surfaces (all versions in `package.json` were hand-specified against known-good releases at time of writing, but should be reconciled against npm's registry on first install).

## 1. Clone and install dependencies

```bash
git clone <your-repo-url> pinoytax-ai
cd pinoytax-ai
npm install --workspaces
```

## 2. Start infrastructure dependencies

```bash
docker compose up -d postgres redis rabbitmq
```

Confirm all three are healthy:

```bash
docker compose ps
```

## 3. Configure environment variables

```bash
cp apps/api/.env.example apps/api/.env
```

Edit `apps/api/.env`:
- `DATABASE_URL` — defaults match the Docker Compose Postgres service; adjust if you're running Postgres elsewhere.
- `JWT_ACCESS_SECRET` — generate one: `openssl rand -hex 32`
- `ANTHROPIC_API_KEY` — required for the AI Tax Assistant to function; the rest of the app works without it, but AI Assistant endpoints will fail.
- `SMTP_*` — required for email verification/password reset to actually send. For local dev, point at a service like Mailtrap or Mailhog.
- `S3_*` — required for the Document Vault to function. For local dev, you can point at a local MinIO container (not included in the default `docker-compose.yml` — add one, or leave document upload untested until you configure real storage).
- Leave `SEED_ADMIN_EMAIL` / `SEED_ADMIN_PASSWORD` unset unless you want a platform admin account created by the seed script.

## 4. Run database migrations and seed data

```bash
cd apps/api
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed
cd ../..
```

`prisma migrate deploy` applies the hand-authored SQL migrations in `apps/api/prisma/migrations/` in order. If this is your very first run against a fresh database and any statement fails (e.g. a Postgres extension isn't available, or a role already exists), read the specific migration file — each one is commented — before re-running.

## 5. Run the backend

```bash
npm run dev:api
```

The API listens on `http://localhost:3001`. Swagger/OpenAPI docs are at `http://localhost:3001/docs`. Health check: `http://localhost:3001/health`.

In a second terminal, run the background worker (required for compliance scans and notification dispatch to actually process):

```bash
cd apps/api
npm run build && node dist/worker.js
```

(There is no `worker:dev` script yet — add one with `ts-node-dev src/worker.ts` if you want hot-reload during development.)

## 6. Run the frontend

```bash
npm run dev:web
```

The frontend listens on `http://localhost:3000` and expects the API at `http://localhost:3001/v1` by default. If that default doesn't match your setup, `cp apps/web/.env.local.example apps/web/.env.local` and edit `NEXT_PUBLIC_API_URL` — Next.js only exposes `NEXT_PUBLIC_*` vars to the browser, and they're baked in at build time, so changing it after `next build` requires a rebuild.

## 7. Verify the setup

1. Visit `http://localhost:3000/register`, create an account.
2. Check your configured SMTP inbox (or Mailtrap/Mailhog) for the verification email, and visit the verification link.
3. Log in.
4. Create a company.
5. Visit the company dashboard and click "Run compliance scan" — this should populate filing deadlines (requires the worker process from step 5 to be running, since the scan is processed via the BullMQ queue).

If any step fails, check:
- API logs for the actual error (structured JSON via Pino — pipe through `| npx pino-pretty` if running the built `dist/main.js` directly instead of `start:dev`, which already applies pretty-printing in non-production `NODE_ENV`).
- That both `postgres` and `redis` containers are healthy (`docker compose ps`).
- That the worker process is running (compliance scans and notifications are processed asynchronously and will silently queue forever without it).

## 8. Running tests

Test suites (unit, integration, e2e) are called out in `apps/api/package.json` scripts (`npm test`, `npm run test:e2e`) but the actual test files have not yet been written in this repository — see `CHANGELOG.md` for status. Contributions adding test coverage are very welcome; see `CONTRIBUTING.md`.
