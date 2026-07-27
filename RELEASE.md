# PinoyTax AI — Release Notes

## v0.1.0 — Initial Release Candidate

**Release type:** Pre-production release candidate. This is the first complete, internally-audited build of the PinoyTax AI platform, covering the full backend API and the first-phase frontend UI. It has been reviewed for architecture, security, and consistency, but has **not been executed** in this environment (no network access was available to run `npm install`, compile, or test against a live database) — see `INSTALL.md` for first-run verification steps that must be completed before any deployment.

### What's included

**Backend (`apps/api`)**
- Identity & Access: registration, email verification, login/logout, JWT access + rotating opaque refresh tokens, account lockout, session/device history, password reset
- Organizations: company profiles, branches (schema only), staff invitations (accountant/bookkeeper), company profile editing
- Payroll: employee records, payroll run lifecycle (draft → compute → finalize), SSS/PhilHealth/Pag-IBIG/withholding computation via the tax engine
- Tax Engine: deterministic, rule-driven computation for VAT, percentage tax, EWT, income tax, and withholding tax — every rate sourced from a seeded, versioned, citation-carrying rule table, never hardcoded
- Compliance: automatic filing-deadline generation from company profile, VAT-threshold misclassification detection, duplicate-transaction detection, compliance percentage rollups
- AI Tax Assistant: retrieval-grounded conversational assistant (RAG over the seeded regulatory knowledge base), confidence flagging, source citation — computations are never performed by the LLM
- Document Vault: versioned document storage on S3-compatible object storage, folder hierarchy, signed download URLs
- Government Form Library: reference metadata for BIR/SSS/PhilHealth/Pag-IBIG forms
- Notifications: channel-agnostic dispatch (email/SMS/push/in-app) with per-user preferences, scheduled deadline reminders (30/14/7/3/1-day)
- Admin: platform-wide audit log and security event visibility, gated by a dedicated platform-admin flag
- Cross-cutting: RBAC via company-scoped roles and permissions, append-only audit logging, structured logging (Pino), health checks, OpenAPI/Swagger documentation, BullMQ background queues, RabbitMQ domain event publishing

**Frontend (`apps/web`)**
- Authentication flows: login, registration, email verification, password reset
- Company list/creation
- Company compliance dashboard: filing deadlines, compliance percentage, flagged issue management
- (In progress — see `CHANGELOG.md` for what remains: payroll UI, tax computation UI, documents UI, AI assistant chat UI, settings/staff-invite UI)

### Known limitations in this release

- **Row-Level Security is infrastructure-in-place, not yet a live control.** The migration exists and the policies are defined, but no request path currently sets the `app.current_company_id` session variable. Tenant isolation today is enforced entirely at the application query layer (every service scopes queries by `companyId`, and every sub-resource fetch verifies ownership before returning data — see `SECURITY.md`).
- **Tax rates and filing deadlines are illustrative starting values**, each carrying a `sourceReference` citation, but require sign-off from an accountant or tax counsel before being relied on for real filings. See the module-level comments in `TaxEngineService` and `ComplianceService`.
- **No direct e-filing integration.** The platform prepares and organizes filings for manual submission through existing government portals; it does not submit filings to BIR/SSS/PhilHealth/Pag-IBIG on the user's behalf, since none of those agencies currently expose a stable public API for that.
- **Billing/subscription management is not yet designed or built.**
- **Firm-level multi-client management** (the `Firm` model) exists in the schema but has no dedicated CRUD endpoints yet.
- Frontend coverage for payroll, tax computation, documents, and the AI assistant is not yet built (backend APIs for all of these are complete and tested via manual audit).

### Upgrade notes

N/A — this is the first release.
