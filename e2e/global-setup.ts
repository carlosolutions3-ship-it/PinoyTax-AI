import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { FIXTURES } from './fixtures';

/**
 * Seeds two pre-verified accounts the same way prisma/seed.ts bootstraps the
 * platform admin (isEmailVerified set directly, bypassing the real email
 * link) — the only practical way to get a *verified* account into an E2E run
 * without a mail-catcher service, since only the token's hash is persisted
 * and the raw token is never recoverable after issuance. Every other step in
 * every spec exercises the real UI and real API.
 *
 * Also clears out any leftover fixture company from a previous run so
 * "create a company" is exercised fresh every time — company_id on old
 * audit log rows is nulled first since audit.audit_logs is intentionally
 * NOT cascade-deleted with its company (append-only trail), so a plain
 * DELETE on org.companies would otherwise fail its FK constraint.
 */
export default async function globalSetup(): Promise<void> {
  const prisma = new PrismaClient();
  try {
    await prisma.$executeRawUnsafe(
      `UPDATE audit.audit_logs SET company_id = NULL WHERE company_id = (SELECT id FROM org.companies WHERE tin = $1)`,
      FIXTURES.company.tin,
    );
    // payroll.payslips -> payroll.employees has no ON DELETE rule (payslips
    // are financial records deliberately not silently destroyed by an
    // employee-record change), so Company's cascade delete fails once
    // payroll has actually been run for it — not reachable from any current
    // UI flow (there's no "delete company" feature yet), but real enough
    // for this fixture's repeated create/teardown cycle to hit it.
    await prisma.$executeRawUnsafe(
      `DELETE FROM payroll.payslips WHERE employee_id IN (SELECT id FROM payroll.employees WHERE company_id = (SELECT id FROM org.companies WHERE tin = $1))`,
      FIXTURES.company.tin,
    );
    await prisma.company.deleteMany({ where: { tin: FIXTURES.company.tin } });

    for (const user of [FIXTURES.owner, FIXTURES.accountant]) {
      const passwordHash = await argon2.hash(user.password, { type: argon2.argon2id });
      await prisma.user.upsert({
        where: { email: user.email },
        create: {
          email: user.email,
          passwordHash,
          firstName: user.firstName,
          lastName: user.lastName,
          isEmailVerified: true,
        },
        update: { passwordHash, isEmailVerified: true },
      });
    }
  } finally {
    await prisma.$disconnect();
  }
}
