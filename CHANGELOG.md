# Changelog

Format loosely follows [Keep a Changelog](https://keepachangelog.com/). This project has not yet had a numbered release cut for the frontend; the backend is at release-candidate v0.1.0 (see `RELEASE.md`).

## [Unreleased]

### Still to build
- Frontend pages: payroll (employees, payroll runs, compute/finalize UI), tax computations (compute/list/confirm UI), documents (folders, upload, versions, download UI), AI Assistant chat UI, company settings (staff invite, company edit, notification preferences UI)
- Dockerfile for `apps/web`, and re-enabling the `web` service in `docker-compose.yml` once it exists
- Automated test suites: unit tests (especially `TaxEngineService`'s bracket/flat-rate math), integration tests (Testcontainers against real Postgres), e2e tests (Playwright)
- CI/CD pipeline (GitHub Actions): lint, type-check, test, build, security scan
- Dependency vulnerability scanning (`npm audit` / Snyk / Dependabot)
- Field-level encryption for TIN and government ID numbers
- Wiring Row-Level Security to an actual live per-request control (currently infrastructure-in-place only — see `SECURITY.md`)
- Firm-level multi-client CRUD endpoints (schema exists, no controller yet)
- Branch and company-document-linking CRUD endpoints (schema exists, no controller yet)
- Billing/subscription management (not in original scope, flagged as a pre-launch gap)
- A penetration test before handling real production financial data

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
