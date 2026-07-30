# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). See `RELEASE.md` for the current recommended version number and go/no-go status.

## [Unreleased]

### Still to build
Everything the frontend was originally missing (payroll, tax, documents, AI assistant, settings, admin, reports, forms, notifications, profile pages), the web Dockerfile, CI/CD, an initial E2E/unit test suite, and (as of v1.2.0) a full Firm/multi-client-management architecture have all since been built — see "Added" below and `RELEASE.md`. What's genuinely still open:
- **Tax rate accuracy**: several seeded tax rates (`apps/api/prisma/seed.ts`) are explicitly marked `SCAFFOLD VALUE, VERIFY BEFORE USE` — flat approximations (e.g. EWT, SSS) standing in for the real bracketed government tables. This is the single highest-priority item before handling a real customer's numbers; see `PRODUCTION_CHECKLIST.md` and `KNOWN_LIMITATIONS.md`.
- Wiring the E2E suite (`e2e/`) into CI — it runs locally today but isn't yet a required check on `main`/PRs.
- Field-level encryption for TIN and government ID numbers.
- Wiring Row-Level Security to an actual live per-request control (currently infrastructure-in-place only, application-layer `companyId` scoping is the real current boundary — see `SECURITY.md`).
- Branch and company-document-linking CRUD endpoints beyond what's already built (schema exists for the rest, no controller yet).
- Billing/subscription management (not in original scope, flagged as a pre-launch gap).
- A distributed lock for the deadline-reminder cron if the worker is ever scaled beyond one replica (safe today at one replica — see `NotificationsSchedulingModule`'s doc comment).
- A penetration test before handling real production financial data.

### Added since the backend-only snapshot below
Full frontend build-out (all pages: payroll, tax, documents, AI assistant, company settings/branches/roles, reports, admin, forms library, notifications, profile), a shared component library and premium visual redesign, GitHub Actions CI (lint/build/test on every push/PR), a Playwright E2E suite covering the core user journeys, Dependabot, structured-logging correlation IDs and process-crash handlers, a database backup/restore runbook, an accessibility and performance pass, and a full pre-launch release audit (RBAC/tenant-isolation review, N+1 fixes, validation gaps, dead code removal, Docker build reproducibility). See git history for the detailed commit-by-commit record — this file tracks the high-level backend milestones below as originally written.

### Added
- **Identity & Access**: registration, email verification, login/logout with rotating opaque refresh tokens, account lockout, session/device history, forgot/reset password
- **Users**: `GET /users/me` profile endpoint, `GET /users/me/notifications`
- **Organizations**: company creation/read/update, staff invitation workflow (accountant/bookkeeper)
- **Payroll**: employee records, payroll run lifecycle (draft/compute/finalize), run listing and detail retrieval
- **Tax Engine**: deterministic rule-driven computation service for VAT, percentage tax, EWT, income tax, withholding tax; computation listing, detail, and confirmation
- **Compliance**: automatic filing-deadline generation based on company profile, VAT-threshold misclassification detection, duplicate-payroll-run detection, compliance percentage rollups, flagged-issue management
- **AI Tax Assistant**: RAG-grounded conversational assistant with source citation and confidence flagging, backed by a lexical knowledge-base retriever over seeded tax rules and form templates
- **Document Vault**: folders, versioned document storage on S3-compatible object storage, signed download URLs
- **Government Form Library**: reference metadata and downloadable templates for BIR/SSS/PhilHealth/Pag-IBIG forms
- **Notifications**: channel-agnostic dispatch (email/SMS/push/in-app) via BullMQ queue, per-user preferences, scheduled deadline reminders (30/14/7/3/1-day)
- **Admin**: platform-wide audit log and security event visibility
- **Infrastructure**: BullMQ/Redis queue system, RabbitMQ domain event publishing, Pino structured logging, Terminus health checks, Swagger/OpenAPI docs, hand-authored SQL migrations (initial schema, Row-Level Security, append-only audit grants), multi-stage production Dockerfile, separate worker entrypoint
- **Frontend**: Next.js app scaffold, typed API client with envelope handling and refresh-on-401, auth pages (login/register/verify-email/forgot-password/reset-password), company list/creation, company compliance dashboard

### Fixed (found during internal review, prior to any external release)
- **Security (high severity)**: IDOR vulnerability across payroll, tax computations, compliance issues, documents, and AI conversations — sub-resources fetched by ID without verifying they belonged to the route's `companyId`. Fixed by requiring and checking `companyId` ownership on every such lookup. See `SECURITY.md` for full details.
- **Security (medium severity)**: cross-tenant dangling references possible via `folderId`/`parentFolderId` in the Documents module — fixed by validating the referenced folder belongs to the same company.
- **Compile-breaking**: two broken relative import paths (`use-my-companies.ts`, `admin-audit.controller.ts`) that pointed at nonexistent files in the wrong directory.
- **Dead code**: removed an unused `JWT_REFRESH_SECRET` config value and env var — refresh tokens are opaque hashed values, never JWTs, so this was misleading unused configuration.
- **Documentation accuracy**: corrected comments in `PrismaService` and the RLS migration that overstated Row-Level Security as an active control when no request path actually invokes it yet.
- **Missing API surface**: added `GET /users/me`, `GET /companies/:companyId/payroll-runs`, `GET /companies/:companyId/payroll-runs/:runId`, `GET /companies/:companyId/tax-computations`, and `GET /companies/:companyId/tax-computations/:id` — all were needed by the frontend but had never been built.
- **Missing feature**: `ComplianceService` computed compliance percentages and reacted to filing deadlines but never actually generated them — added `generateFilingDeadlines()`.
- **Missing feature**: the `company:write` permission was seeded but no endpoint used it — added `PATCH /companies/:companyId`.
- **Config bugs**: fixed an invalid BullMQ Redis connection shape (`{ url }` instead of a real `Redis` instance with `maxRetriesPerRequest: null`), an unreliable `amqplib` type reference, and a `docker-compose.yml` that referenced a not-yet-existing frontend Dockerfile.
- **Minor**: removed duplicate database fetches of the same company row across `runComplianceScan`/`generateFilingDeadlines`/`checkVatClassificationRisk`; removed one unused Swagger import.
