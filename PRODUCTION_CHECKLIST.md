# Production Deployment Checklist

Work through this in order before deploying to a real production environment. As of v1.2.0, every item in §0 below has been verified against **real `docker build` output actually booted in a real `docker compose` stack** (Postgres/Redis/RabbitMQ + the built api/worker/web images, not `npm run start:dev`) — re-run them yourself against your own target infrastructure before going live, since this pass does not substitute for verifying against your actual production database, secrets, and network.

## 0. First execution (do this before anything else)

- [x] Build the real `apps/api` and `apps/web` Docker images (`docker build`, not just `npm run build`) and confirm both succeed
- [x] Boot the built images in a real `docker compose` stack (Postgres/Redis/RabbitMQ + api/worker/web) with `NODE_ENV=production` and confirm all six containers report healthy
- [x] Run `npx prisma migrate deploy` (or the SQL files directly) against that real Postgres and confirm every migration in `apps/api/prisma/migrations/` applies cleanly, in order, with no errors — confirm all 10 schemas exist afterward
- [x] Run `npm run prisma:seed` and confirm roles/permissions/tax rules/form templates/firm roles load without error
- [x] Confirm `GET /health`, `/health/live`, `/health/ready` all return 200 from the running container
- [x] Run the full Playwright critical-journeys suite against the running production-mode stack (not dev servers) and confirm every journey passes
- [x] Rehearse a full backup/restore cycle (`pg_dump` → fresh DB → `pg_restore`) against the live container and confirm all schemas/row counts survive — see `BACKUP_RESTORE.md`

**Four real, deployment-only bugs were found and fixed this way** — none of them were visible in dev mode (`nest start --watch` never touches the compiled output) or in CI (which only checks that `npm run build` compiles, never boots the result):
1. `dist/main.js` never existed — the compiled output nested under `dist/src/main.js` because `tsconfig.build.json` had no `rootDir`, and `apps/api`'s own `start:prod` script was broken (fixed: pinned `rootDir` and excluded `prisma/` from the build compile).
2. `prisma` (the CLI) was a devDependency, so it was missing entirely from the production image — `prisma migrate deploy` had nothing to run (fixed: moved to `dependencies`).
3. The runtime image's files were all root-owned while the container runs as non-root `pinoytax`, so `prisma migrate deploy` couldn't write its engine cache (fixed: `--chown=pinoytax:pinoytax` on every `COPY` in the runtime stage).
4. The `worker` container reported "unhealthy" forever in `docker ps`/Swarm/ECS — it shares the `api` image's `HEALTHCHECK`, which HTTP-probes a port only the `api` process listens on (fixed: `WORKER_PROCESS=true` skips the HTTP probe for it — irrelevant for Kubernetes, which never reads a Dockerfile's `HEALTHCHECK`, but matters for `docker-compose`/Swarm/ECS).

See `DEPLOYMENT.md` for the exact commands and `RELEASE.md`'s v1.2.0 entry for the full writeup, including what a sandboxed CI-like environment's network policy specifically could and couldn't verify (a confirmed policy block on Alpine's own package CDN, unrelated to any of the four fixes above — real production/CI environments have normal internet access and won't hit it).

## 1. Secrets & configuration

- [ ] `JWT_ACCESS_SECRET` generated fresh (`openssl rand -hex 32`), not the placeholder value, unique to this environment
- [ ] `DATABASE_URL` points at the `pinoytax_app` role (not a superuser), with a strong generated password — rotate the placeholder password set in migration `20240101000002_audit_append_only`
- [ ] `NODE_ENV=production` set on both `api` and `worker` processes
- [ ] `APP_WEB_URL` set to the real production frontend origin (affects CORS, cookie scoping, and email links)
- [ ] `ANTHROPIC_API_KEY` set and valid
- [ ] `SMTP_*` set to a real transactional email provider, `SMTP_FROM` uses a domain with SPF/DKIM configured
- [ ] `S3_*` set to the real production bucket, with versioning and server-side encryption enabled on the bucket itself
- [ ] `SEED_ADMIN_EMAIL`/`SEED_ADMIN_PASSWORD` either unset (promote an admin manually post-launch) or set to a real, strong credential you will rotate immediately after first login
- [ ] All secrets injected via your platform's secret manager — none committed to version control, none in plain ConfigMaps

## 2. Database

- [ ] Managed Postgres 15+ provisioned, with automated backups and point-in-time recovery enabled
- [ ] Confirmed backup restore has been tested at least once (a backup that's never been restored is not a verified backup) — see `BACKUP_RESTORE.md` for the runbook and rehearsal checklist
- [ ] Migrations applied via `prisma migrate deploy` (not `migrate dev`)
- [ ] Confirmed the `pinoytax_app` role exists and has the expected grants (full CRUD on all schemas except `audit.audit_logs`/`audit.security_events`, which are INSERT+SELECT only) — verify with `\dp audit.audit_logs` in `psql`
- [ ] Confirmed `pinoytax_app` does NOT have `BYPASSRLS` or superuser
- [ ] Decide and document your position on Row-Level Security: it is currently infrastructure-in-place, not a live control (see `SECURITY.md`) — either accept application-layer scoping as sufficient for launch, or prioritize wiring RLS in before handling real customer data at scale

## 3. Security

- [ ] Read `SECURITY.md` in full, in particular the IDOR section — confirm no new endpoint added since that review reintroduces the same bug class
- [ ] `/docs` (Swagger) access restricted at the network/ingress layer — not left open to the public internet
- [ ] TLS termination configured at the load balancer/ingress; confirm `secure: true` cookie flag is actually effective (i.e., the app sees `NODE_ENV=production` and the connection is genuinely HTTPS end-to-end, not just at the edge with an unencrypted hop behind it)
- [ ] Rate limits reviewed against expected real traffic patterns (defaults: 120 req/min general, 10/min login, 5/min forgot-password)
- [ ] Dependency vulnerability scan run (`npm audit` at minimum; Snyk/Dependabot recommended) and any high/critical findings resolved
- [ ] Confirm no `.env` file (only `.env.example`) is present in the deployed container image or committed to git
- [ ] Plan for field-level encryption of TIN/SSS/PhilHealth/Pag-IBIG numbers before scaling to real production PII volume (not yet implemented — see `SECURITY.md`)

## 4. Compliance content accuracy

- [x] Seeded rates re-verified against official sources (Jul 2026): VAT 12%, percentage tax 3%, TRAIN income tax brackets, SSS employee share 5% (SSS Circular No. 2024-006), PhilHealth employee share 2.5% (PhilHealth May 2026 advisory), Pag-IBIG employee share 2% (HDMF Circular No. 460) — see `KNOWN_LIMITATIONS.md` for exactly what is and isn't modeled (ceiling caps yes, low-income floors no). **Still needs a licensed accountant/tax counsel's independent sign-off before real filings** — this was verified via web search against public sources, not a professional review, and does not substitute for one.
- [ ] EWT (expanded withholding tax) has no single correct default rate to verify — BIR RR 2-98 sets different rates per income-payment type. Before relying on EWT computations, add distinct rule codes per payment type (professional fees, rentals, goods, services, etc.) — see `apps/api/prisma/seed.ts`'s `EWT_RATE_DEFAULT` comment.
- [ ] The same reviewer has checked the due-date logic in `ComplianceService.generateFilingDeadlines` against the current official filing calendar
- [ ] Confirm the product's user-facing copy does not claim automated e-filing — this platform prepares filings for manual submission only (no stable public e-filing API exists for BIR/SSS/PhilHealth/Pag-IBIG as of this writing)

## 5. Infrastructure & deployment

- [ ] `api` and `worker` deployed as separate scalable units from the same image (see `DEPLOYMENT.md` §5)
- [ ] Readiness probe wired to `GET /health/ready`, liveness probe to `GET /health/live`
- [ ] Redis and RabbitMQ provisioned as managed services (or equivalently HA-configured), not the single-instance Docker Compose containers
- [ ] Structured logs (stdout, JSON via Pino) are actually being collected by your log aggregation platform
- [ ] Confirm the worker process is actually running and processing jobs in the target environment — compliance scans and notification dispatch silently do nothing without it
- [ ] Rollback plan documented and tested: previous image revision can be redeployed; migrations are forward-only, so schema rollback requires a DBA-reviewed manual plan, not an automated down-migration

## 6. Post-launch

- [ ] Monitoring/alerting configured for: API error rate, queue depth (compliance-scan and notification-dispatch), failed login spike (possible credential stuffing), database connection pool exhaustion
- [ ] A schedule for reviewing `audit.security_events` (failed logins, account lockouts, permission-denied events) is established
- [ ] A schedule for re-verifying seeded tax rates against regulatory changes is established (rates and brackets do change; nothing in this codebase auto-updates them)
- [ ] Penetration test scheduled, ideally before onboarding real paying customers with real financial data

## 7. Frontend completeness

- [x] Payroll, tax computation, documents, AI Assistant, reports, roles & permissions, and settings frontend pages built
- [x] `apps/web/Dockerfile` created and the `web` service re-enabled in `docker-compose.yml`
- [x] Frontend build (`npm run build --workspace=apps/web`) verified to actually produce a working standalone output
- [x] Responsive layout verified at desktop, tablet, and mobile viewports

See `KNOWN_LIMITATIONS.md` for what's intentionally still out of scope for v1.0.
