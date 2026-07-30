# Known Limitations — v1.0

This is the authoritative, current list of what PinoyTax AI v1.0 intentionally does not do, or does not yet do well. It supersedes any "known limitations" notes in older documents (`RELEASE.md`, `PRODUCTION_CHECKLIST.md`) where they conflict — this file is maintained going forward; those are historical snapshots.

## Compliance content

- **Seeded tax rates were re-verified against official sources in July 2026** (VAT 12%, percentage tax 3%, TRAIN income tax brackets, SSS employee share 5% via SSS Circular No. 2024-006, PhilHealth employee share 2.5% via PhilHealth's May 2026 advisory, Pag-IBIG employee share 2% via HDMF Circular No. 460) — all previously flagged `SCAFFOLD VALUE`/`VERIFY CURRENT RATE` values are now sourced. SSS/PhilHealth/Pag-IBIG are modeled as capped-at-ceiling (e.g. SSS caps at the ₱35,000 Maximum Salary Credit) rather than growing linearly forever, but **do not model the low-income floor** each program also has (e.g. a salary below SSS's ₱5,000 MSC floor should still be credited at ₱5,000, not the literal lower amount) — see the `sourceReference` on each rule in `apps/api/prisma/seed.ts` for the exact gap. **EWT remains an explicit, un-fillable placeholder**: BIR RR 2-98 (as amended) sets different rates per income-payment type (professional fees, rentals, goods, services — roughly 1%–15%), not one flat rate, so there is no single "correct" value to verify a flat default against; real deployments must add distinct rule codes per payment type before relying on EWT computations. An accountant or tax counsel must still review all of this — along with the due-date logic in `ComplianceService.generateFilingDeadlines` — before any business relies on this platform for real filings.
- **No automatic rate updates.** Nothing in this codebase watches for regulatory changes (BIR revenue regulations, SSS/PhilHealth/Pag-IBIG contribution table revisions). A recurring manual review process must be established.
- **No direct e-filing integration.** The platform computes, tracks, and organizes filings for manual submission through the existing BIR/SSS/PhilHealth/Pag-IBIG portals. It does not submit filings on the user's behalf — none of those agencies currently expose a stable public API for that.

## Security

- **Row-Level Security is infrastructure-in-place, not a live control.** The migration and policies exist (`prisma/migrations/20240101000001_row_level_security`, `..._force_row_level_security`), but no request path sets the `app.current_company_id` session variable yet. Tenant isolation today is enforced entirely at the application query layer: every service scopes queries by `companyId`, and every sub-resource fetch verifies ownership before returning data. See `SECURITY.md` for the full analysis.
- **No field-level encryption for TIN/SSS/PhilHealth/Pag-IBIG numbers.** These are stored as plain columns, protected by the same access controls as the rest of the row, not by additional encryption-at-the-field-level. Plan for this before scaling to a large real-PII volume.
- **27 known npm dependency vulnerabilities in `apps/api`, 7 in `apps/web`**, per `npm audit --omit=dev`, none in first-party code. All require a breaking major-version bump to resolve (e.g. `@nestjs/platform-express` v10→v11, which would break NestJS's required version lockstep across `@nestjs/*` packages; Next.js v14→v16; `nodemailer` v6→v9; `argon2`'s native build toolchain). These were deliberately **not** force-upgraded in v1.0 — the risk of an untested breaking bump to a pinned framework major outweighed the benefit, since the affected packages are not on a path directly reachable by unauthenticated attacker input in this app's usage of them. Schedule a dedicated upgrade-and-regression-test cycle rather than running `npm audit fix --force` blind.
- **No penetration test has been performed.** Recommended before onboarding real paying customers with real financial data.

## Multi-tenancy & billing

- **Firm-level multi-client management (the `Firm` model) has no dedicated CRUD endpoints.** The schema supports an accounting firm managing multiple client companies, but there's no UI or API surface to create/manage a firm yet — `firm_admin` role permissions exist and are enforced, but nothing currently assigns that role at scale.
- **No billing or subscription management.** There is no plan tier, payment integration, usage metering, or subscription lifecycle anywhere in the codebase.

## RBAC as shipped

The seeded default role permissions are deliberately conservative — a `business_owner` cannot run tax computations or write payroll directly; that's reserved for `accountant`/`bookkeeper`/`firm_admin` roles, reflecting a "business owner engages an accountant" real-world model. If your target customer expects the owner to self-serve tax/payroll, adjust `ROLE_PERMISSIONS` in `apps/api/prisma/seed.ts` before launch — this is a product decision, not a bug. See `ADMIN_MANUAL.md` for the full permission matrix.

## Frontend

- **Global full-text search across companies/records does not exist.** Filtering and pagination are implemented per-page (Documents, Payroll, Tax, Notifications, Forms) over already-loaded data; there is no cross-entity search bar.
- **No dark mode toggle**, despite the design tokens (`darkMode: 'class'` in `tailwind.config.js`) being dark-mode-ready. Wiring an actual toggle and auditing every page against it was out of scope for v1.0.
- **Placeholder brand assets.** The logo, favicon, and illustrations (`apps/web/src/components/brand/`) are original but placeholder-quality flat-vector work, not a commissioned brand identity — by explicit design direction for v1.0, swap them when a real identity is commissioned.

## Performance

- **Payroll computation does a per-employee tax-rule lookup.** `PayrollService.computePayroll` queries `tax_engine.tax_rules` up to 4 times per employee (SSS, PhilHealth, Pag-IBIG, withholding tax) via `TaxEngineService`, even though 3 of those 4 rules are identical for every employee in the same run (same `periodEnd`). This was deliberately left as-is rather than caching the rate in `PayrollService` and duplicating the `base × rate` arithmetic outside `TaxEngineService` — for a tax-compliance app, having a single source of truth for tax math outweighs the performance win at realistic (tens-to-low-hundreds) employee counts. If payroll runs become a measured bottleneck, prefer adding a batch-lookup method to `TaxEngineService` itself (so the math stays in one place) over caching in the caller.

## Infrastructure

- **Docker image builds were not verified with a live `docker build` in the environment that produced this release** — this sandbox's network egress policy blocks pulls from Docker Hub's CDN (confirmed as a policy denial via the proxy status endpoint, not a transient failure). Both `apps/api/Dockerfile` and `apps/web/Dockerfile` were instead verified by reproducing their exact isolated build context by hand (`npm install` + build + boot, with no parent monorepo files present, matching what Docker's build context will see) — see the git history on the `docker-compose-verification` work for the full method. **Run an actual `docker compose build && docker compose up` once in an environment with registry access before relying on these images.**
- **The provided `docker-compose.yml` is for local development and staging smoke-tests only**, not a production deployment mechanism — see `DEPLOYMENT.md` for the real deployment shape (separate scalable services, managed Postgres/Redis/RabbitMQ, S3).
- **No APM/distributed tracing is wired in.** Structured JSON logs (Pino) go to stdout; add OpenTelemetry instrumentation if your organization requires tracing.
