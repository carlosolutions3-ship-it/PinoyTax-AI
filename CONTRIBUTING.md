# Contributing to PinoyTax AI

Thanks for helping build this. A few things matter more here than in a typical app, given the domain — please read before opening a PR.

## Ground rules for this codebase specifically

1. **Never hardcode a tax rate, bracket, or filing deadline rule in application code.** All of that lives in `tax_engine.tax_rules` / `tax_rates_history`, seeded via `apps/api/prisma/seed.ts` and read at runtime by `TaxEngineService`. If you're adding a new kind of computation, add a new rule code and seed row, not a numeric literal in a `.ts` file. This is a hard architectural rule, not a style preference — see the doc comment at the top of `tax-engine.service.ts` for why.
2. **The AI Assistant never computes taxes.** If you're touching `AiAssistantService`, keep it that way — arithmetic belongs in `TaxEngineService` only. The assistant's job is retrieval-grounded explanation, not calculation.
3. **Every sub-resource endpoint nested under `/companies/:companyId/...` must verify the fetched record's `companyId` matches the route**, not just rely on `PermissionsGuard` checking the route param. We had a real IDOR vulnerability class here during initial development (see `SECURITY.md`) — any new "get by ID" or "update by ID" method under a company-scoped route needs this check. Look at `PayrollService.getPayrollRun` or `TaxEngineService.getById` as the reference pattern.
4. **New permission codes must be added to both places at once**: the `@RequirePermissions(...)` decorator on the route, and the `PERMISSIONS` array + `ROLE_PERMISSIONS` map in `prisma/seed.ts`. A permission used but never seeded will make every request requiring it fail with 403 for all users, silently.
5. **Money fields are `Decimal` in Prisma / `NUMERIC` in Postgres, never `Float`/`number` in the schema.** They serialize as strings over JSON — the frontend types in `apps/web/src/lib/types.ts` reflect this (e.g. `basicSalary: string`). Don't "fix" this by switching to `number` — floating point and currency don't mix.
6. **Audit anything that changes a financial or compliance record** with the `@Audit({ action, entityType })` decorator (see `modules/audit/audit.decorator.ts`). The audit log is append-only by database grant — don't add UPDATE/DELETE permissions to `pinoytax_app` on `audit.audit_logs` under any circumstance.

## Development workflow

1. Fork/branch from `main`.
2. Follow `INSTALL.md` to get a working local environment.
3. Make your change. Keep it scoped — one concern per PR.
4. If you touched the Prisma schema, add a corresponding hand-written SQL migration under `apps/api/prisma/migrations/<timestamp>_<name>/migration.sql` (this repo does not use `prisma migrate dev`'s auto-generation workflow — migrations here are authored directly; see `DEPLOYMENT.md` for why).
5. If you added an endpoint, add it to `apps/web/src/lib/endpoints.ts` with a matching type in `types.ts` **only if the frontend actually needs it** — don't speculatively wire up endpoints nothing calls.
6. Run through the manual verification steps in `INSTALL.md` §7 before opening a PR — there is no CI test suite yet to catch regressions for you (see `CHANGELOG.md`).

## Code style

- TypeScript strict mode is on; don't disable it locally or add `// @ts-ignore` to work around a real type error — fix the type.
- No `any`. If you're tempted to reach for it, the type is probably `unknown` plus a runtime check, or you're missing a proper DTO.
- Prefer explicit, small service methods over clever one-liners — this is a compliance product; readability and auditability outrank brevity.
- Match existing patterns for error responses: throw `HttpException` subclasses with `{ code, message, details? }`, never a bare string or unstructured object.

## Commit messages

Conventional style is appreciated but not enforced: `feat(payroll): add overtime pay to payslip breakdown`, `fix(auth): correct refresh token rotation race`, etc.

## Security issues

Do not open a public issue for a security vulnerability. See `SECURITY.md` for how to report one privately.

## What needs help right now

See the "Still to build" section of `CHANGELOG.md` — frontend pages for payroll, tax computations, documents, and the AI assistant are the most valuable next contributions, followed by an actual automated test suite (unit tests for `TaxEngineService`'s bracket math would be an excellent first PR).
