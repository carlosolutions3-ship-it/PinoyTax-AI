# API Reference

Base URL: `http://localhost:3001/v1` (local) — all routes below are relative to this prefix.

Full interactive documentation (request/response schemas, try-it-out) is served at `/docs` (Swagger UI) whenever the API is running. This document is a quick-reference index of every real, implemented endpoint — kept in sync with the actual controllers, not aspirational.

**Response envelope** (every endpoint, success or error):
```json
{ "data": <result or null>, "meta": { "requestId": "...", "timestamp": "..." }, "errors": [{ "code": "...", "message": "...", "details": "..." }] }
```

**Authentication:** unless marked `(public)`, every endpoint requires `Authorization: Bearer <accessToken>`. Endpoints nested under `/companies/:companyId/...` additionally require the caller to hold an active role on that company with the listed permission.

---

## Auth (`/auth`)

| Method & Path | Public? | Permission | Description |
|---|---|---|---|
| `POST /auth/register` | public | — | Create an account; sends a verification email |
| `POST /auth/verify-email` | public | — | Verify email with the token from the email link |
| `POST /auth/login` | public | — | Login; sets refresh-token cookie, returns access token |
| `POST /auth/refresh` | public | — | Rotate refresh token (reads cookie), returns new access token |
| `POST /auth/logout` | public | — | Revoke the current session |
| `POST /auth/forgot-password` | public | — | Request a password reset email |
| `POST /auth/reset-password` | public | — | Reset password with a token; revokes all sessions |
| `GET /auth/sessions` | auth | — | List the caller's active sessions/devices |
| `DELETE /auth/sessions/:sessionId` | auth | — | Revoke a specific session |

## Users (`/users`)

| Method & Path | Description |
|---|---|
| `GET /users/me` | Current user's profile |
| `GET /users/me/notifications` | Current user's notifications (all companies) |

## Companies (`/companies`)

| Method & Path | Permission | Description |
|---|---|---|
| `POST /companies` | auth | Create a company; caller becomes `business_owner` |
| `GET /companies` | auth | List companies the caller has a role on |
| `GET /companies/:companyId` | `company:read` | Get company profile |
| `PATCH /companies/:companyId` | `company:write` | Update company profile (VAT classification change triggers a compliance re-scan) |
| `POST /companies/:companyId/invitations` | `staff:invite` | Invite an existing user as accountant/bookkeeper |
| `POST /companies/invitations/:invitationId/accept` | auth | Accept a pending invitation addressed to the caller |

## Payroll (`/companies/:companyId`)

| Method & Path | Permission | Description |
|---|---|---|
| `POST .../employees` | `payroll:write` | Add an employee |
| `GET .../employees` | `payroll:read` | List active employees |
| `POST .../payroll-runs` | `payroll:write` | Create a draft payroll run for a period |
| `GET .../payroll-runs` | `payroll:read` | List payroll runs |
| `GET .../payroll-runs/:runId` | `payroll:read` | Get a payroll run with its payslips |
| `POST .../payroll-runs/:runId/compute` | `payroll:write` | Compute draft payslips (SSS/PhilHealth/Pag-IBIG/withholding via the tax engine) |
| `POST .../payroll-runs/:runId/finalize` | `payroll:finalize` | Finalize a run (immutable afterward); blocked if any payslip has unresolved errors |

## Tax computations (`/companies/:companyId/tax-computations`)

| Method & Path | Permission | Description |
|---|---|---|
| `POST /` | `tax:compute` | Run a deterministic tax computation (VAT, percentage tax, EWT, income tax, withholding); returns `missingInputs` instead of guessing if required data is absent |
| `GET /` | `tax:compute` | List past computations for the company |
| `GET /:computationId` | `tax:compute` | Get one computation |
| `POST /:computationId/confirm` | `tax:confirm` | Confirm a draft computation (immutable afterward) |

## Compliance (`/companies/:companyId`)

| Method & Path | Permission | Description |
|---|---|---|
| `GET .../deadlines` | `compliance:read` | List filing deadlines (optional `?status=` filter) |
| `GET .../compliance-status` | `compliance:read` | Compliance percentage by category (BIR/SSS/PhilHealth/Pag-IBIG) |
| `GET .../flagged-issues` | `compliance:read` | List detected compliance issues |
| `POST .../compliance-scan` | `compliance:read` | Manually trigger a compliance scan (also runs automatically on company creation/update) |
| `PATCH .../flagged-issues/:issueId` | `compliance:write` | Acknowledge/resolve/dismiss an issue |

## AI Assistant (`/companies/:companyId/ai/conversations`)

| Method & Path | Permission | Description |
|---|---|---|
| `POST /` | `ai_assistant:use` | Start a conversation |
| `GET /:conversationId` | `ai_assistant:use` | Get a conversation with its messages |
| `POST /:conversationId/messages` | `ai_assistant:use` | Send a message; response includes source citations and a confidence flag (`grounded` / `low_confidence` / `missing_info`) |

## Documents (`/companies/:companyId/documents`)

| Method & Path | Permission | Description |
|---|---|---|
| `POST .../folders` | `documents:write` | Create a folder |
| `GET .../folders` | `documents:read` | List folders |
| `GET /` | `documents:read` | List documents (optional `?folderId=`, `?category=`) |
| `POST /` | `documents:write` | Upload a document (multipart: `file`, `category`, optional `folderId`) |
| `POST /:documentId/versions` | `documents:write` | Upload a new version of an existing document |
| `GET /:documentId/versions` | `documents:read` | List a document's version history |
| `GET /:documentId/download` | `documents:read` | Get a time-limited signed download URL (5 min) |

## Government Form Library (`/forms`) — all public

| Method & Path | Description |
|---|---|
| `GET /forms` | List form templates (optional `?agency=`) |
| `GET /forms/:formCode` | Get a form's metadata |
| `GET /forms/:formCode/download` | Get a signed download URL for the blank template |

## Notifications (`/notification-preferences`)

| Method & Path | Description |
|---|---|
| `GET /notification-preferences` | List the caller's channel/category preferences |
| `PATCH /notification-preferences` | Set a preference (`channel`, `category`, `isEnabled`) |

## Admin (`/admin`) — requires platform-admin flag, not a company role

| Method & Path | Description |
|---|---|
| `GET /admin/audit-logs/:companyId` | Audit log entries for a company (optional `?take=`) |
| `GET /admin/security-events` | Platform-wide security events (optional `?take=`) |

## Health (`/health`) — public

| Method & Path | Description |
|---|---|
| `GET /health` | Full check: Postgres, Redis, memory heap |
| `GET /health/live` | Liveness only — no dependency checks |
| `GET /health/ready` | Readiness — Postgres + Redis connectivity |

---

## Error codes reference

Common `code` values returned in the `errors[]` array (non-exhaustive — see individual services for the full set):

| Code | Meaning |
|---|---|
| `UNAUTHORIZED` | Missing/invalid/expired access token |
| `FORBIDDEN` | Authenticated, but lacks the required company role/permission |
| `ACCOUNT_LOCKED` | Too many failed login attempts |
| `EMAIL_NOT_VERIFIED` | Login blocked pending email verification |
| `INVALID_CREDENTIALS` | Wrong email/password (deliberately generic — never reveals which) |
| `TIN_ALREADY_REGISTERED` | Company creation with a duplicate TIN |
| `INVITEE_NOT_REGISTERED` | Staff invite target has no account yet |
| `PAYROLL_RUN_IMMUTABLE` | Attempted to recompute a finalized/paid run |
| `PAYROLL_RUN_HAS_ERRORS` | Finalize blocked — see `details` for which employees/fields |
| `TAX_COMPUTATION_NOT_FOUND` / `PAYROLL_RUN_NOT_FOUND` / `DOCUMENT_NOT_FOUND` / `CONVERSATION_NOT_FOUND` / `ISSUE_NOT_FOUND` | Resource not found **or** belongs to a different company (deliberately indistinguishable — see `SECURITY.md`) |
