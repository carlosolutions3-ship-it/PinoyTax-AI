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
