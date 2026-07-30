# End-to-end tests

Playwright specs covering the critical user journeys: registration/login,
company creation and the compliance dashboard, the staff invite → accept
flow, payroll + tax computation as an accountant, and a mobile-viewport
navigation smoke test.

## Prerequisites

The full stack must already be running and reachable:

- Postgres with migrations applied (`npx prisma migrate deploy --schema=apps/api/prisma/schema.prisma`)
- Redis
- The API on `http://localhost:3001` (`npm run start:dev --workspace=apps/api`)
- The web app on `http://localhost:3000` (`npm run dev --workspace=apps/web`, or a production build via `npm run build && npm run start --workspace=apps/web`)

`DATABASE_URL` must be set in the shell that runs the tests — `global-setup.ts`
connects directly to seed two pre-verified fixture accounts (see
`fixtures.ts`), the only practical way to get past email verification without
a mail-catcher service.

## Running

```bash
export DATABASE_URL=postgresql://pinoytax:pinoytax_dev_password@localhost:5432/pinoytax_ai
export E2E_CHROMIUM_PATH=/opt/pw-browsers/chromium-1194/chrome-linux/chrome  # only needed in this sandbox; omit to use Playwright's own managed browser
npm run test:e2e
```

All journeys live in one file, `critical-journeys.spec.ts`, as a single
serial `test.describe` block (`mode: 'serial'`) sharing live browser
contexts across tests instead of handing off `storageState` snapshots
between files — later tests depend on both page state (the company created
earlier) and the live session (the owner/accountant logins), so they must
run in order, in the same worker, against the same contexts. Running a
subset out of order will fail for that reason; run the whole file.

`global-setup.ts` clears out any previous run's fixture company (by its fixed
TIN) before seeding, so re-running the suite repeatedly against the same
database is safe.
