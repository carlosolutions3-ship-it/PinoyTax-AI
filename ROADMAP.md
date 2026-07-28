# Post-Launch Roadmap

What comes after v1.0. Nothing here has been started — this is a plan, not a backlog in progress. It supersedes the "Still to build" list in `CHANGELOG.md`, which reflects an earlier, now largely-completed snapshot. See `KNOWN_LIMITATIONS.md` for the detailed reasoning behind each gap this roadmap addresses.

## Near-term (v1.1 candidates)

Highest-leverage items — mostly closing gaps already flagged in `KNOWN_LIMITATIONS.md`:

- **Wire Row-Level Security to a live per-request control.** Set `app.current_company_id` on the database session at the top of the request lifecycle so RLS policies actually enforce tenant isolation as a second layer beneath the existing application-level scoping, rather than sitting unused.
- **Automated end-to-end test suite.** A checked-in, CI-runnable Playwright suite covering the golden paths this release verified manually: register → verify → login → create company → payroll run → tax computation → compliance scan → document upload.
- **CI/CD pipeline** (GitHub Actions): lint, type-check, `npm test`, build, and a dependency vulnerability scan gate on every PR.
- **Dependency upgrade cycle** for the 27 (api) / 7 (web) known vulnerabilities that require breaking major-version bumps — done deliberately, with full regression testing, not as a blind `--force` fix. Priority: `@nestjs/platform-express` + the rest of the `@nestjs/*` family together, then `nodemailer`, then Next.js.
- **Firm-level multi-client CRUD.** The `Firm` schema and `firm_admin` role/permissions already exist; build the controller, service, and a firm-scoped UI so an accounting firm can actually manage multiple client companies from one account.
- **Global search.** A cross-entity search bar (companies, employees, documents, tax computations) — today, filtering exists per-page but nothing searches across entity types.

## Mid-term

- **Field-level encryption** for TIN, SSS, PhilHealth, and Pag-IBIG numbers, ahead of any meaningful real-PII scale.
- **Billing and subscription management** — plan tiers, payment integration, usage metering. Entirely unbuilt today; needs product/pricing decisions before engineering starts.
- **Notification/conversation history UI.** Right now the AI Assistant's conversation is remembered per-session but not listed/searchable across past conversations; notifications are listed but there's no "mark all read" or bulk action.
- **Dark mode.** The design tokens (`darkMode: 'class'` in `tailwind.config.js`) are ready; needs an actual toggle, a persisted preference, and a full visual audit against it.
- **Commissioned brand identity.** Replace the placeholder logo, favicon, and illustrations (`apps/web/src/components/brand/`) with real commissioned artwork once the product has a settled visual identity to invest in.
- **APM / distributed tracing.** OpenTelemetry instrumentation across API + worker, for organizations that need it beyond structured stdout logs.

## Long-term / needs product scoping first

- **Direct e-filing integration**, contingent on BIR/SSS/PhilHealth/Pag-IBIG exposing stable public APIs for it — none currently do, so this is blocked externally, not by engineering capacity.
- **Automated regulatory-rate updates** — some mechanism (manual review cadence at minimum, ideally a monitored feed) to keep seeded tax rates and filing-deadline rules current as regulations change, rather than the one-time review this release calls for.
- **Mobile app** (native or React Native), if usage data post-launch shows demand beyond the responsive web app.
- **Penetration test**, ideally before onboarding real paying customers with real financial data — a one-time engagement, not an engineering roadmap item, but tracked here as a launch-blocking-adjacent milestone.
