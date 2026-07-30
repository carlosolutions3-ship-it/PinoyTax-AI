# PinoyTax AI

An AI-assisted tax compliance, payroll, and government-filing platform built for Philippine accounting firms and the businesses they serve — deterministic tax computation (VAT, percentage tax, EWT, income tax, withholding), payroll with SSS/PhilHealth/Pag-IBIG contributions, automatic filing-deadline tracking, a document vault, and a retrieval-grounded AI assistant for regulatory questions.

Monorepo: `apps/api` (NestJS, multi-schema Postgres via Prisma) and `apps/web` (Next.js 14 App Router).

## Getting started

New to this repo? Start with **[`INSTALL.md`](INSTALL.md)** for local setup (Postgres, Redis, RabbitMQ, environment variables, running both apps).

## Documentation map

| Doc | What it's for |
|---|---|
| [`INSTALL.md`](INSTALL.md) | Local development setup, running tests |
| [`API.md`](API.md) | Endpoint reference (also served live at `/docs` via Swagger) |
| [`USER_MANUAL.md`](USER_MANUAL.md) | Using the product as a business owner/accountant/bookkeeper |
| [`ADMIN_MANUAL.md`](ADMIN_MANUAL.md) | Roles/permissions, staff management, platform-admin operations |
| [`DEPLOYMENT.md`](DEPLOYMENT.md) | Docker Compose, production deployment |
| [`PRODUCTION_CHECKLIST.md`](PRODUCTION_CHECKLIST.md) | Pre-launch checklist — work through this before going live |
| [`BACKUP_RESTORE.md`](BACKUP_RESTORE.md) | Database/object-storage backup and restore runbook |
| [`SECURITY.md`](SECURITY.md) | Security model, tenant isolation, known-fixed vulnerabilities |
| [`KNOWN_LIMITATIONS.md`](KNOWN_LIMITATIONS.md) | Deliberate, documented gaps — read before filing a bug for one of these |
| [`RELEASE.md`](RELEASE.md) | Current version, what's included, go/no-go status |
| [`CHANGELOG.md`](CHANGELOG.md) | Notable changes, in Keep a Changelog format |
| [`ROADMAP.md`](ROADMAP.md) | Planned work, by horizon |
| [`CONTRIBUTING.md`](CONTRIBUTING.md) | How to contribute |

## Development

```bash
npm install --workspaces
npm run dev:api     # apps/api on :3001
npm run dev:web     # apps/web on :3000
npm test --workspace=apps/api
npm run test:e2e    # Playwright — see e2e/README.md
```

See `INSTALL.md` for the full setup (database, Redis, RabbitMQ, environment variables) before running the above.
