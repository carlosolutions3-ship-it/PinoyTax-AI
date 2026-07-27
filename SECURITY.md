# Security Policy

## Reporting a vulnerability

Do not open a public GitHub issue for a security vulnerability. Instead, email the maintainers directly (replace with your organization's actual security contact before publishing this repo) with:

- A description of the issue and its impact
- Steps to reproduce
- Any relevant logs or request/response examples (redact real user data)

We aim to acknowledge reports within 3 business days.

## What this document covers

A summary of the security-relevant design decisions in this codebase, known gaps, and what was found/fixed during internal review — so a reviewer or auditor doesn't have to reverse-engineer it from the code alone.

## Authentication & session management

- Passwords hashed with Argon2id (`argon2` package, `argon2id` variant explicitly selected).
- Access tokens are short-lived JWTs (15 min default), signed with `JWT_ACCESS_SECRET`.
- Refresh tokens are **opaque random values**, not JWTs — generated via `crypto.randomBytes(32)`, only the SHA-256 hash is ever persisted (`identity.sessions.refresh_token_hash`), and they rotate on every use (old one revoked, new one issued). A stolen refresh token can be replayed at most once before the legitimate user's next refresh call fails, which is a detectable signal of compromise.
- Refresh tokens live in an `httpOnly`, `secure` (in production), `SameSite=Strict` cookie scoped to the `/v1/auth` path only — never accessible to JavaScript, never sent on unrelated requests.
- Account lockout after `MAX_FAILED_LOGIN_ATTEMPTS` (default 5) failed attempts, with a time-boxed lock (`ACCOUNT_LOCK_DURATION_MINUTES`, default 15) and an email alert to the account owner.
- Login attempts (success and every failure mode) are recorded in `identity.login_history` for the account-owner-facing "Device History" feature.
- Forgot-password/reset-password never reveals whether an email address has an account (identical response either way).

## Authorization (RBAC)

- Every company-scoped route is guarded by `PermissionsGuard`, which checks the authenticated user holds an **active** `UserCompanyRole` on the `companyId` in the route, and that role's permission set includes every code declared via `@RequirePermissions(...)` on the handler.
- Platform administration (`/admin/*`) is gated separately by `AdminGuard`, checking a dedicated `users.is_platform_admin` flag — deliberately not modeled as a company role, since it isn't scoped to any single company. This flag is only settable directly in the database or by the seed script; there is no self-service or API path to grant it.
- Permission codes are seeded in `prisma/seed.ts` and cross-checked against every `@RequirePermissions(...)` call as part of the standing review process (see `CONTRIBUTING.md` rule 4).

## Multi-tenancy & data isolation

**Found and fixed during internal review — read this if you're auditing this codebase:** an earlier version of this backend had an **IDOR (Insecure Direct Object Reference) vulnerability class** across several modules. Endpoints like `GET /companies/:companyId/payroll-runs/:runId` validated that the caller had a role on `:companyId` (via `PermissionsGuard`), but then fetched the sub-resource (`:runId`) by its own primary key only — without checking that the fetched record's `companyId` actually matched the route. This meant an authenticated user with a legitimate role on *any* company could potentially read or mutate *another* company's payroll runs, tax computations, flagged compliance issues, documents, or AI conversations, simply by supplying a different resource UUID in the URL while keeping a `companyId` they did have access to.

This was fixed by requiring `companyId` as an explicit parameter on every such service method and verifying `record.companyId === companyId` before returning or mutating anything, returning a generic "not found" (never "forbidden") on mismatch so the response doesn't confirm the other company's resource even exists. Fixed in: `PayrollService` (`getPayrollRun`, `computePayrollRun`, `finalizePayrollRun`), `TaxEngineService` (`confirm`, `getById`), `ComplianceService` (`updateIssueStatus`), `DocumentsService` (`uploadNewVersion`, `listVersions`, `getDownloadUrl`, plus cross-tenant `folderId`/`parentFolderId` reference validation), and `AiAssistantService` (`getConversation`, `sendMessage`).

**If you add a new endpoint nested under a company-scoped route that fetches a resource by its own ID, you must add this check.** This is the single most important pattern to get right in this codebase.

- **Row-Level Security (RLS)**: a migration (`20240101000001_row_level_security`) defines PostgreSQL RLS policies on every tenant-scoped table, intended as defense-in-depth beyond application-layer scoping. **As of this release, these policies are not yet a live control** — no request path sets the `app.current_company_id` session variable they depend on, so they operate in their permissive fallback branch. The active isolation boundary today is the application-layer `where: { companyId }` filtering (and the IDOR fixes above) present throughout `src/modules/**`. Wiring RLS in fully would require routing every Prisma call for a request through a single request-scoped transaction — tracked as a follow-up, not silently claimed as done. See `PrismaService.withTenantContext`'s doc comment.
- The database role intended for application traffic (`pinoytax_app`, created in migration `20240101000002_audit_append_only`) has no special bypass privileges and should never be granted `BYPASSRLS` or superuser.

## Audit logging

- `audit.audit_logs` is **append-only at the database grant level** — the application's runtime role has `INSERT`/`SELECT` only; `UPDATE`/`DELETE` are explicitly revoked in migration `20240101000002_audit_append_only`. Even a bug or a compromised application process cannot silently alter or erase the audit trail without a separate elevated database credential.
- Mutating financial/compliance actions (payroll finalization, tax computation confirmation, company profile updates) are recorded via the `@Audit()` decorator + `AuditInterceptor`, capturing actor, before/after state, and IP address.

## Secrets & sensitive data

- TIN and government ID numbers (SSS/PhilHealth/Pag-IBIG) are stored as plain columns today — **field-level encryption for these is called out in the Phase 1 architecture as a requirement but is not yet implemented in this codebase.** Treat this as a required follow-up before handling real production PII at scale; the database itself should also be encrypted at rest (a hosting-provider-level configuration, not application code).
- No secret is ever logged: Pino logging config (`logging/logger.module.ts`) redacts `Authorization` headers, cookies, and password/token fields in request bodies.
- File uploads go directly to S3-compatible storage with `ServerSideEncryption: 'AES256'`; the API process never writes uploaded files to local disk.
- Signed download URLs expire in 5 minutes.

## Input validation & injection

- Every DTO uses `class-validator` decorators with `whitelist: true, forbidNonWhitelisted: true` globally applied — unknown fields in a request body are stripped/rejected, not silently passed through to Prisma.
- All database access goes through Prisma's query builder (parameterized under the hood); the one raw SQL call in the codebase (`PrismaService.withTenantContext`, for setting the RLS session variable — see above re: not yet wired in) validates its `companyId` argument against a strict UUID regex before interpolating it, since `SET LOCAL` cannot bind parameters.

## Rate limiting

- Global default: 120 requests/minute per client (NestJS Throttler).
- Login: 10/minute. Forgot-password: 5/minute. Tighter limits on these specifically to slow credential-stuffing and enumeration attempts.

## Transport security

- `helmet()` applied globally for standard security headers.
- CORS restricted to the configured `APP_WEB_URL` origin with `credentials: true` — not a wildcard.
- TLS termination is expected to happen at the load balancer/ingress layer in production (see `DEPLOYMENT.md`); the app does not terminate TLS itself.

## Known gaps / not yet done

- Field-level encryption for TINs and government ID numbers (see above).
- RLS not yet wired to a live per-request control (see above).
- No automated dependency vulnerability scanning configured yet in CI (see `CHANGELOG.md`/CI config — add `npm audit` or Snyk/Dependabot before production launch).
- No penetration test has been performed. Strongly recommended before handling real financial data for real businesses at any scale.
- `/docs` (Swagger) is unauthenticated by default — restrict it at the network/ingress layer in production.
