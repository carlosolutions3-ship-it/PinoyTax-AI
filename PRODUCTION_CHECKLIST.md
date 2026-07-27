# Production Deployment Checklist

Work through this in order. Do not skip the "Verification-only" items just because the code exists — nothing in this repository has been compiled or run in the environment it was built in (no network access was available), so this checklist assumes today is the first time it will actually execute.

## 0. First execution (do this before anything else)

- [ ] Run `npm install --workspaces` and resolve any dependency version conflicts npm surfaces
- [ ] Run `npx prisma generate` and confirm the Prisma Client builds against `schema.prisma` without errors
- [ ] Run `npm run build` for `apps/api` and confirm a clean TypeScript compile
- [ ] Run `npx prisma migrate deploy` against a real disposable Postgres instance and confirm every migration in `apps/api/prisma/migrations/` applies cleanly, in order, with no errors
- [ ] Boot the API (`node dist/main.js`) against that database and confirm `/health` returns 200
- [ ] Run `npm run prisma:seed` and confirm roles/permissions/tax rules/form templates load without error
- [ ] Manually exercise the flow in `INSTALL.md` §7 end to end (register → verify → login → create company → run compliance scan) with the worker process also running

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
- [ ] Confirmed backup restore has been tested at least once (a backup that's never been restored is not a verified backup)
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

- [ ] An accountant or tax counsel has reviewed every seeded row in `tax_engine.tax_rules`/`tax_rates_history` against current, actual BIR/SSS/PhilHealth/Pag-IBIG rates — several are explicitly marked `SCAFFOLD VALUE, VERIFY BEFORE USE` in `prisma/seed.ts`
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

## 7. Frontend completeness (if launching beyond the compliance dashboard)

- [ ] Payroll, tax computation, documents, and AI Assistant frontend pages built (backend APIs are complete; UI is not — see `CHANGELOG.md`)
- [ ] `apps/web/Dockerfile` created and the `web` service re-enabled in `docker-compose.yml`
- [ ] Frontend build (`npm run build --workspace=apps/web`) verified to actually produce a working standalone output
