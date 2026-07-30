# PinoyTax AI — Release Notes

## v1.0.0 — General availability

The first complete, end-to-end verified release of PinoyTax AI: full backend API, full frontend UI across every module, a premium redesigned interface, and a production Docker Compose setup for every service including the previously-missing frontend image.

### What's included

**Backend (`apps/api`)**
- **Identity & Access**: registration, email verification, login/logout, JWT access tokens + rotating opaque refresh tokens, account lockout, session/device history with per-session revocation, forgot/reset password
- **Organizations**: company profiles (create/read/update), branch management (create/update/deactivate), staff invitations and revocation (accountant/bookkeeper), full RBAC role/permission matrix
- **Payroll**: employee records, payroll run lifecycle (draft → compute → finalize), SSS/PhilHealth/Pag-IBIG/withholding computation via the tax engine
- **Tax Engine**: deterministic, rule-driven computation for VAT, percentage tax, EWT, income tax, and withholding tax — every rate sourced from a seeded, versioned, citation-carrying rule table, never hardcoded
- **Compliance**: automatic filing-deadline generation from company profile, VAT-threshold misclassification detection, duplicate-transaction detection, compliance percentage rollups, flagged-issue lifecycle
- **AI Tax Assistant**: retrieval-grounded conversational assistant (RAG over the seeded regulatory knowledge base), confidence flagging, source citation — computations are never performed by the LLM
- **Document Vault**: versioned document storage on S3-compatible object storage, folder hierarchy, signed download URLs
- **Government Form Library**: reference metadata and downloadable templates for BIR/SSS/PhilHealth/Pag-IBIG forms
- **Notifications**: channel-agnostic dispatch (email/SMS/push/in-app) with per-user, per-category preferences, scheduled deadline reminders (30/14/7/3/1-day)
- **Admin**: platform-wide audit log and security event visibility, gated by a dedicated platform-admin flag
- **Cross-cutting**: RBAC via company-scoped roles and permissions, append-only audit logging, structured logging (Pino), health checks, OpenAPI/Swagger docs, BullMQ background queues, RabbitMQ domain event publishing

**Frontend (`apps/web`)** — every module now has a full UI, redesigned around a premium SaaS visual language (deep-emerald/royal-blue palette, Inter typeface, a shared component library, and original placeholder brand assets):
- Authentication: login, registration, email verification, forgot/reset password — new split-screen layout with a brand panel
- Company list/creation, and a per-company left-sidebar + tab-bar shell that's responsive down to mobile
- Company dashboard: personalized greeting, compliance/issues/deadlines/overdue KPI tiles, quick-action shortcuts, filing deadlines, flagged issues, and a severity chart
- Payroll: employee management (with search), payroll run lifecycle, payslip computation and review
- Tax: computation form and history (filterable by type/status, paginated)
- Documents: folders, upload, versioning, download, search/filter, paginated
- AI Assistant: chat interface with suggested prompts, typing indicator, confidence badges, and source citations
- Reports: payroll/tax/compliance summaries with charts, built from finalized/confirmed records only
- Roles & permissions: staff invite/revoke UI with the full permission matrix enforced
- Settings: company profile editing, branch management
- Notifications: history (filterable, paginated) and per-channel preference toggles
- Government forms library: searchable, filterable by agency
- Admin panel: platform-wide security events and per-company audit log lookup
- Profile: account details, password reset trigger, active session management

**Infrastructure**
- `apps/web/Dockerfile` (new this release) using Next.js standalone output, and the `web` service re-enabled in `docker-compose.yml` — every service (postgres, redis, rabbitmq, api, worker, web) now builds and runs from one `docker compose up`
- Multi-stage production Dockerfile for the API + worker (shared image, different entrypoints)

### Known limitations

See `KNOWN_LIMITATIONS.md` for the full, current list. Highlights: seeded tax rates/deadlines are illustrative pending accountant sign-off, Row-Level Security is infrastructure-in-place but not yet a live per-request control, no e-filing integration, no billing/subscription management, and 27 (api) / 7 (web) dependency vulnerabilities that require breaking major-version bumps were deliberately deferred rather than force-upgraded blind. None of these block a v1.0 launch on their own, but each has a real operational implication — read the full list before going live.

### Upgrade notes

N/A for this release — v1.0.0 is the first general-availability build. Future releases will document schema migration order and any breaking API/config changes here.

---

## v1.1.0 — Full pre-launch release audit

A complete audit of every module, page, endpoint, permission, background job, environment variable, Docker file, GitHub workflow, and document — assuming real paying customers deploy tomorrow — followed by fixing everything found. No breaking API or schema changes; this is a hardening release.

### Fixed
- **AI Assistant was completely broken**: `ai-assistant.service.ts` called a non-existent Anthropic model id (`claude-sonnet-4-6`) — every request would have failed in production. Fixed to a real model id, and wrapped the call so a transient upstream failure returns a clean, retryable error instead of leaving a conversation half-written.
- **Silent daily reminder failures**: the filing-deadline reminder cron had no error isolation — one bad row could silently skip every company's reminder for the day with no retry. Now isolated per reminder window and per recipient (and batched to remove an N+1 query).
- **Missing validation**: payroll runs and tax computations could be created with an inverted period (end before start) — added cross-field validation, both server- and client-side.
- **Audit trail gap**: creating and computing a payroll run (real payslip numbers for every employee) wasn't audit-logged — only the final "finalize" step was.
- **Ungraceful 500s**: an admin endpoint's `?take=` query param produced an unhandled 500 on non-numeric input instead of a clean 400.
- **Reports page data loss**: a `Promise.all` across payroll/tax/compliance fetches meant one expected 403 (a role without tax access) blanked out payroll and compliance data the user *did* have access to — switched to `Promise.allSettled`.
- **Tax page offered a doomed-to-fail form**: a role without tax access saw a fully interactive "New computation" form that would always 403 on submit — now shows one clear message instead.
- **Reports page loading flash**: empty-state text and a "Loading…" line rendered simultaneously on every load — now uses the same skeleton pattern as every sibling page.
- **Accessibility**: unlabeled filter dropdowns on three pages now have accessible names.
- **Mobile overflow**: a fixed-width admin input and two un-scrollable admin tables now behave correctly below 400px.
- **Non-reproducible Docker builds**: both Dockerfiles ran `npm install` with no lockfile in their build context — any image build could resolve different transitive dependency versions. Now `npm ci` against a real, committed, verified lockfile.
- **Dead/broken tooling**: removed a `test:e2e` script in `apps/api/package.json` pointing at a nonexistent Jest config; the real E2E suite is the root `npm run test:e2e` (Playwright).
- **Stale/inaccurate documentation**: `INSTALL.md` claimed no tests exist (79 do); `CHANGELOG.md`'s "still to build" list named things already shipped. Both corrected; added a missing root `README.md`.

### Added
- A GitHub Actions `e2e` job: seeds the database, builds and boots both apps in production mode, and runs the full Playwright suite on every push/PR — previously local-only.
- Failed-job visibility: BullMQ processors now log at error level when a job exhausts all retries, distinct from a mid-retry warning.

### Still open (see `KNOWN_LIMITATIONS.md` and `PRODUCTION_CHECKLIST.md`)
Unverified/scaffold tax rates are the top remaining item before this product can be trusted with a real customer's numbers — this requires a Philippine tax accountant's sign-off, not an engineering fix, and this audit deliberately did not invent replacement figures. RLS-as-a-live-control, field-level PII encryption, and a pre-launch penetration test remain open, all already tracked pre-audit.
