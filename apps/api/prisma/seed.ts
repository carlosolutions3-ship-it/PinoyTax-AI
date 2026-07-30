import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';

const prisma = new PrismaClient();

const PERMISSIONS: { code: string; label: string }[] = [
  { code: 'company:read', label: 'View company profile' },
  { code: 'company:write', label: 'Edit company profile' },
  { code: 'staff:invite', label: 'Invite accountants/bookkeepers' },
  { code: 'payroll:read', label: 'View payroll records' },
  { code: 'payroll:write', label: 'Create/edit payroll records' },
  { code: 'payroll:finalize', label: 'Finalize payroll runs' },
  { code: 'tax:compute', label: 'Run tax computations' },
  { code: 'tax:confirm', label: 'Confirm tax computations' },
  { code: 'compliance:read', label: 'View compliance status and deadlines' },
  { code: 'compliance:write', label: 'Update flagged issue status' },
  { code: 'documents:read', label: 'View documents' },
  { code: 'documents:write', label: 'Upload/manage documents' },
  { code: 'ai_assistant:use', label: 'Use the AI Tax Assistant' },
];

const ROLE_PERMISSIONS: Record<string, string[]> = {
  business_owner: [
    'company:read',
    'company:write',
    'staff:invite',
    'payroll:read',
    'compliance:read',
    'documents:read',
    'documents:write',
    'ai_assistant:use',
  ],
  accountant: [
    'company:read',
    'payroll:read',
    'payroll:write',
    'payroll:finalize',
    'tax:compute',
    'tax:confirm',
    'compliance:read',
    'compliance:write',
    'documents:read',
    'documents:write',
    'ai_assistant:use',
  ],
  bookkeeper: [
    'company:read',
    'payroll:read',
    'payroll:write',
    'tax:compute',
    'compliance:read',
    'documents:read',
    'documents:write',
    'ai_assistant:use',
  ],
  firm_admin: [
    'company:read',
    'company:write',
    'staff:invite',
    'payroll:read',
    'payroll:write',
    'payroll:finalize',
    'tax:compute',
    'tax:confirm',
    'compliance:read',
    'compliance:write',
    'documents:read',
    'documents:write',
    'ai_assistant:use',
  ],
  administrator: PERMISSIONS.map((p) => p.code),
};

async function seedRolesAndPermissions() {
  for (const permission of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: permission.code },
      create: permission,
      update: { label: permission.label },
    });
  }

  for (const [roleCode, permissionCodes] of Object.entries(ROLE_PERMISSIONS)) {
    const role = await prisma.role.upsert({
      where: { code: roleCode },
      create: { code: roleCode, name: humanizeRoleCode(roleCode) },
      update: { name: humanizeRoleCode(roleCode) },
    });

    for (const permissionCode of permissionCodes) {
      const permission = await prisma.permission.findUniqueOrThrow({
        where: { code: permissionCode },
      });
      await prisma.rolePermission.upsert({
        where: { roleId_permissionId: { roleId: role.id, permissionId: permission.id } },
        create: { roleId: role.id, permissionId: permission.id },
        update: {},
      });
    }
  }
}

function humanizeRoleCode(code: string): string {
  return code
    .split('_')
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(' ');
}

/**
 * SEED TAX RULES — these are ILLUSTRATIVE STARTING VALUES matching commonly
 * cited Philippine rates as of this codebase's authoring, each with a
 * source_reference field for auditability. Before relying on this platform
 * for real filings, an accountant or tax counsel MUST review and, where
 * needed, correct/update these rows — the engine will only ever be as
 * correct as this seeded data (see TaxEngineService's module doc comment).
 */
// TaxRateHistory.id is a real Postgres `uuid` column (see the init
// migration), so upsert targets must be valid UUIDs — these are fixed so
// re-running the seed stays idempotent, with the human-readable key kept
// only as an in-code label.
const SEED_TAX_RATE_IDS: Record<string, string> = {
  'seed-vat-rate-2023': 'a424562d-9f98-469f-b35e-3b3e8a95607a',
  'seed-percentage-tax-2023': '74b6a200-b8ca-4854-a7cf-147b346d2328',
  'seed-ewt-default-2023': 'ddb7b13b-bf01-49e4-b69a-68d163e00c14',
  'seed-sss-employee-2023': '6b741c1e-937a-4cd7-a4be-e85f7073bef6',
  'seed-sss-employee-bracket2': '4c3cbdb0-37db-480d-9d88-e169997c1552',
  'seed-philhealth-employee-2023': 'f55d1001-b997-4359-8f67-c01218e6e917',
  'seed-philhealth-employee-bracket2': '0ca835c6-333e-4a58-8f77-452198ceefd2',
  'seed-pagibig-employee-2023': '41214964-a779-4d6f-a104-72bb584965ab',
  'seed-pagibig-employee-bracket2': '082b59ab-0e40-4896-9f14-ea3e5fd219f2',
  'seed-vat-threshold-2023': 'f3247d61-9795-4b82-8070-33012610e32d',
  'seed-income-bracket-1': 'ebb892ff-851f-4c05-bfc0-9dc6872a6e97',
  'seed-income-bracket-2': '4721a393-2f05-442a-953d-59315da26c3d',
  'seed-income-bracket-3': 'd8b93ef3-a7b9-49d2-a092-3e07b075e59b',
  'seed-income-bracket-4': 'b493dea1-771f-4071-adf5-b7f12f46d350',
  'seed-income-bracket-5': '10e7b628-7503-447e-b8e0-dfd95563b454',
  'seed-income-bracket-6': '2809815b-5834-4c9c-957e-e73965970d36',
  'seed-wh-bracket-1': 'c7ab7410-f263-4e51-9374-3693713fb591',
  'seed-wh-bracket-2': 'eca7e407-e928-4673-8db6-9fdb5aa833e1',
  'seed-wh-bracket-3': 'aa8494a6-eb8d-430d-8d4a-b1678d5281d2',
  'seed-wh-bracket-4': 'f3668692-0dcb-4d3f-967b-a8499b0c022b',
  'seed-wh-bracket-5': '4e990afa-58b8-4b24-b89e-c464b2027e35',
  'seed-wh-bracket-6': '59c95511-3676-4a4b-b18b-5318b911d88e',
};

async function seedTaxRules() {
  const EFFECTIVE_FROM = new Date('2023-01-01');

  const vatRuleData = {
    description: 'Standard Value-Added Tax rate on gross sales/receipts.',
    appliesTo: 'vat_registered',
    sourceReference: 'NIRC Sec. 106/108, as amended by the TRAIN Law (RA 10963)',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const vatRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'VAT_RATE' },
    create: { ruleCode: 'VAT_RATE', ...vatRuleData },
    update: vatRuleData,
  });
  const vatRateData = { rateValue: 0.12, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-vat-rate-2023'] },
    create: { id: SEED_TAX_RATE_IDS['seed-vat-rate-2023'], ruleId: vatRule.id, ...vatRateData },
    update: vatRateData,
  });

  const percentageTaxRuleData = {
    description: 'Percentage tax rate for non-VAT-registered persons under Sec. 116, NIRC.',
    appliesTo: 'non_vat',
    sourceReference: 'NIRC Sec. 116, as amended by RA 11534 (CREATE Act) — reverted to 3% effective Jul 1, 2023',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const percentageTaxRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'PERCENTAGE_TAX_RATE' },
    create: { ruleCode: 'PERCENTAGE_TAX_RATE', ...percentageTaxRuleData },
    update: percentageTaxRuleData,
  });
  const percentageTaxRateData = { rateValue: 0.03, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-percentage-tax-2023'] },
    create: {
      id: SEED_TAX_RATE_IDS['seed-percentage-tax-2023'],
      ruleId: percentageTaxRule.id,
      ...percentageTaxRateData,
    },
    update: percentageTaxRateData,
  });

  // EWT genuinely has no single correct rate to verify — BIR RR 2-98 (as
  // amended) sets different rates per income-payment type (professional
  // fees, rentals, goods, services, etc., ranging roughly 1%–15%), not one
  // flat percentage. This stays an explicit placeholder rather than an
  // invented "average" — see PRODUCTION_CHECKLIST.md and KNOWN_LIMITATIONS.md.
  const ewtRuleData = {
    description:
      'ILLUSTRATIVE default expanded withholding tax rate. Real deployments must replace this with distinct rule codes per income payment type (e.g. EWT_PROFESSIONAL_FEES, EWT_RENTALS, EWT_GOODS) per BIR RR 2-98 as amended — there is no single correct EWT rate to fall back to.',
    appliesTo: 'income_payments_subject_to_ewt',
    sourceReference:
      'BIR Revenue Regulations No. 2-98, as amended — PLACEHOLDER VALUE, NOT VERIFIABLE AS A SINGLE RATE. Replace with per-income-type rule codes before relying on EWT computations.',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const ewtRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'EWT_RATE_DEFAULT' },
    create: { ruleCode: 'EWT_RATE_DEFAULT', ...ewtRuleData },
    update: ewtRuleData,
  });
  const ewtRateData = { rateValue: 0.02, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-ewt-default-2023'] },
    create: { id: SEED_TAX_RATE_IDS['seed-ewt-default-2023'], ruleId: ewtRule.id, ...ewtRateData },
    update: ewtRateData,
  });

  // Verified against SSS Circular No. 2024-006 (Dec 19, 2024), effective
  // Jan 1, 2025: total contribution rate 15% (employer 10% / employee 5%),
  // Minimum Monthly Salary Credit (MSC) ₱5,000, Maximum MSC ₱35,000 (max
  // employee contribution ₱1,750/month). Modeled as two brackets so the
  // engine's existing graduated-rate logic naturally caps the contribution
  // at the MSC ceiling instead of growing linearly past it.
  //
  // NOT yet modeled, and still real gaps: (1) the MSC *floor* — a salary
  // below ₱5,000 should still be credited at the ₱5,000 MSC (₱250/month),
  // but this bracket structure charges the literal (lower) salary-based
  // amount instead; (2) the mandatory WISP provident fund add-on that
  // applies to the portion of salary between MSC ₱20,000 and ₱35,000;
  // (3) the official schedule is banded in ₱500 MSC increments with
  // published per-bracket peso amounts, not a smooth linear rate — this is
  // a close approximation, not the literal published table. All three
  // require an accountant/payroll specialist review before this is relied
  // on for real filings.
  const sssRuleData = {
    description:
      'Employee share of SSS contribution: 5% of monthly salary, capped at the ₱35,000 Maximum Salary Credit (₱1,750/month max). Approximation of the official bracketed table — see source reference for known gaps (MSC floor, WISP, exact per-bracket rounding).',
    appliesTo: 'employees',
    sourceReference:
      'SSS Circular No. 2024-006 (Dec 19, 2024), effective Jan 1, 2025 — verified via sss.gov.ph, Jul 2026. Approximation: does not model the MSC floor, WISP add-on, or exact ₱500-increment bracket rounding.',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const sssRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'SSS_EMPLOYEE_CONTRIBUTION_RATE' },
    create: { ruleCode: 'SSS_EMPLOYEE_CONTRIBUTION_RATE', ...sssRuleData },
    update: sssRuleData,
  });
  const sssBracket1Data = { rateValue: 0.05, bracketMin: 0, bracketMax: 35000, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-sss-employee-2023'] },
    create: { id: SEED_TAX_RATE_IDS['seed-sss-employee-2023'], ruleId: sssRule.id, ...sssBracket1Data },
    update: sssBracket1Data,
  });
  const sssBracket2Data = { rateValue: 0, bracketMin: 35000, bracketMax: null, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-sss-employee-bracket2'] },
    create: { id: SEED_TAX_RATE_IDS['seed-sss-employee-bracket2'], ruleId: sssRule.id, ...sssBracket2Data },
    update: sssBracket2Data,
  });

  // Verified against PhilHealth's official May 2026 advisory (the final
  // scheduled adjustment under RA 11223 / the UHC Law): total premium 5% of
  // monthly basic salary, split equally 2.5% employee / 2.5% employer, for
  // salaries between the ₱10,000 floor and ₱100,000 ceiling. Modeled as two
  // brackets to cap the contribution at ₱2,500/month past the ceiling — see
  // the same floor caveat as SSS above (a salary below ₱10,000 should still
  // be credited at the ₱10,000 floor, i.e. a flat ₱250/month, which this
  // approximation does not apply).
  const philhealthRuleData = {
    description:
      'Employee share of PhilHealth premium contribution: 2.5% of monthly basic salary (half of the 5% total premium), capped at ₱2,500/month for salaries at or above ₱100,000. Does not apply the ₱10,000 salary floor (flat ₱250/month minimum) — see source reference.',
    appliesTo: 'employees',
    sourceReference:
      'PhilHealth advisory, May 2026: 5% total premium rate confirmed as the final scheduled step under RA 11223 (Universal Health Care Act) — verified via pia.gov.ph, Jul 2026. Approximation: does not model the ₱10,000 salary floor.',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const philhealthRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'PHILHEALTH_EMPLOYEE_CONTRIBUTION_RATE' },
    create: { ruleCode: 'PHILHEALTH_EMPLOYEE_CONTRIBUTION_RATE', ...philhealthRuleData },
    update: philhealthRuleData,
  });
  const philhealthBracket1Data = {
    rateValue: 0.025,
    bracketMin: 0,
    bracketMax: 100000,
    effectiveFrom: EFFECTIVE_FROM,
  };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-philhealth-employee-2023'] },
    create: {
      id: SEED_TAX_RATE_IDS['seed-philhealth-employee-2023'],
      ruleId: philhealthRule.id,
      ...philhealthBracket1Data,
    },
    update: philhealthBracket1Data,
  });
  const philhealthBracket2Data = { rateValue: 0, bracketMin: 100000, bracketMax: null, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-philhealth-employee-bracket2'] },
    create: {
      id: SEED_TAX_RATE_IDS['seed-philhealth-employee-bracket2'],
      ruleId: philhealthRule.id,
      ...philhealthBracket2Data,
    },
    update: philhealthBracket2Data,
  });

  // Verified against HDMF Circular No. 460 (Maximum Fund Salary raised to
  // ₱10,000 effective Feb 2024, unchanged through the 2025–2026 schedule):
  // employee share 2% of monthly compensation, capped at ₱200/month for
  // salaries at or above the ₱10,000 Maximum Fund Salary. Modeled as two
  // brackets for the same reason as SSS/PhilHealth above. Not modeled: the
  // 1% (vs. 2%) rate that applies for monthly compensation of ₱1,500 or
  // below — this approximation always uses 2%, which is correct for the
  // large majority of salaries but slightly overcharges anyone earning at
  // or under that floor.
  const pagibigRuleData = {
    description:
      'Employee share of Pag-IBIG (HDMF) Fund contribution: 2% of monthly compensation, capped at ₱200/month for salaries at or above the ₱10,000 Maximum Fund Salary. Does not apply the 1% lower rate for compensation ≤ ₱1,500/month — see source reference.',
    appliesTo: 'employees',
    sourceReference:
      'HDMF Circular No. 460 (Maximum Fund Salary raised to ₱10,000, effective Feb 2024, unchanged through 2026) — verified Jul 2026. Approximation: does not model the 1% lower-income rate for compensation ≤ ₱1,500/month.',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const pagibigRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'PAGIBIG_EMPLOYEE_CONTRIBUTION_RATE' },
    create: { ruleCode: 'PAGIBIG_EMPLOYEE_CONTRIBUTION_RATE', ...pagibigRuleData },
    update: pagibigRuleData,
  });
  const pagibigBracket1Data = { rateValue: 0.02, bracketMin: 0, bracketMax: 10000, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-pagibig-employee-2023'] },
    create: { id: SEED_TAX_RATE_IDS['seed-pagibig-employee-2023'], ruleId: pagibigRule.id, ...pagibigBracket1Data },
    update: pagibigBracket1Data,
  });
  const pagibigBracket2Data = { rateValue: 0, bracketMin: 10000, bracketMax: null, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-pagibig-employee-bracket2'] },
    create: {
      id: SEED_TAX_RATE_IDS['seed-pagibig-employee-bracket2'],
      ruleId: pagibigRule.id,
      ...pagibigBracket2Data,
    },
    update: pagibigBracket2Data,
  });

  const vatThresholdRuleData = {
    description: 'Annual gross sales/receipts threshold above which VAT registration becomes mandatory.',
    appliesTo: 'non_vat',
    sourceReference: 'NIRC Sec. 236(G), as amended by the TRAIN Law (RA 10963)',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const vatThresholdRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'VAT_REGISTRATION_THRESHOLD' },
    create: { ruleCode: 'VAT_REGISTRATION_THRESHOLD', ...vatThresholdRuleData },
    update: vatThresholdRuleData,
  });
  const vatThresholdRateData = { rateValue: 3000000, effectiveFrom: EFFECTIVE_FROM };
  await prisma.taxRateHistory.upsert({
    where: { id: SEED_TAX_RATE_IDS['seed-vat-threshold-2023'] },
    create: {
      id: SEED_TAX_RATE_IDS['seed-vat-threshold-2023'],
      ruleId: vatThresholdRule.id,
      ...vatThresholdRateData,
    },
    update: vatThresholdRateData,
  });

  // Graduated income tax brackets (individuals) — TRAIN Law, 2023 onward rates.
  const incomeTaxRuleData = {
    description: 'Graduated individual income tax brackets, 2023 onward.',
    appliesTo: 'individuals_mixed_income_self_employed',
    sourceReference: 'NIRC Sec. 24(A), as amended by the TRAIN Law (RA 10963), rates effective 2023',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const incomeTaxRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'INCOME_TAX_BRACKETS' },
    create: { ruleCode: 'INCOME_TAX_BRACKETS', ...incomeTaxRuleData },
    update: incomeTaxRuleData,
  });
  const incomeTaxBrackets: Array<[string, number, number | null, number]> = [
    ['seed-income-bracket-1', 0, 250000, 0],
    ['seed-income-bracket-2', 250000, 400000, 0.15],
    ['seed-income-bracket-3', 400000, 800000, 0.2],
    ['seed-income-bracket-4', 800000, 2000000, 0.25],
    ['seed-income-bracket-5', 2000000, 8000000, 0.3],
    ['seed-income-bracket-6', 8000000, null, 0.35],
  ];
  for (const [label, min, max, rate] of incomeTaxBrackets) {
    const id = SEED_TAX_RATE_IDS[label];
    const bracketData = { rateValue: rate, bracketMin: min, bracketMax: max, effectiveFrom: EFFECTIVE_FROM };
    await prisma.taxRateHistory.upsert({
      where: { id },
      create: { id, ruleId: incomeTaxRule.id, ...bracketData },
      update: bracketData,
    });
  }

  // Graduated compensation withholding tax brackets (monthly), mirroring the
  // same structure as income tax for this scaffold's marginal-rate engine.
  const withholdingCompRuleData = {
    description: 'Graduated withholding tax on compensation brackets (monthly), 2023 onward.',
    appliesTo: 'employees',
    sourceReference: 'BIR Revenue Memorandum Order implementing NIRC Sec. 24(A) monthly withholding table',
    effectiveFrom: EFFECTIVE_FROM,
  };
  const withholdingCompRule = await prisma.taxRule.upsert({
    where: { ruleCode: 'WITHHOLDING_COMP_BRACKETS' },
    create: { ruleCode: 'WITHHOLDING_COMP_BRACKETS', ...withholdingCompRuleData },
    update: withholdingCompRuleData,
  });
  const withholdingBrackets: Array<[string, number, number | null, number]> = [
    ['seed-wh-bracket-1', 0, 20833, 0],
    ['seed-wh-bracket-2', 20833, 33333, 0.15],
    ['seed-wh-bracket-3', 33333, 66667, 0.2],
    ['seed-wh-bracket-4', 66667, 166667, 0.25],
    ['seed-wh-bracket-5', 166667, 666667, 0.3],
    ['seed-wh-bracket-6', 666667, null, 0.35],
  ];
  for (const [label, min, max, rate] of withholdingBrackets) {
    const id = SEED_TAX_RATE_IDS[label];
    const bracketData = { rateValue: rate, bracketMin: min, bracketMax: max, effectiveFrom: EFFECTIVE_FROM };
    await prisma.taxRateHistory.upsert({
      where: { id },
      create: { id, ruleId: withholdingCompRule.id, ...bracketData },
      update: bracketData,
    });
  }
}

async function seedFormTemplates() {
  const forms: Array<{
    formCode: string;
    agency: 'bir' | 'sss' | 'philhealth' | 'pagibig';
    title: string;
    description: string;
    purpose: string;
    filingFrequency: string;
    requiredAttachments: string[];
  }> = [
    {
      formCode: '2303',
      agency: 'bir',
      title: 'Certificate of Registration',
      description: 'Proof of registration with the BIR.',
      purpose: 'Establishes a taxpayer\'s registered business activities and tax types.',
      filingFrequency: 'One-time (upon registration)',
      requiredAttachments: [],
    },
    {
      formCode: '2307',
      agency: 'bir',
      title: 'Certificate of Creditable Tax Withheld at Source',
      description: 'Certificate issued to a payee showing tax withheld on income payments.',
      purpose: 'Supports the payee\'s claim for a tax credit for EWT withheld.',
      filingFrequency: 'Per transaction / quarterly',
      requiredAttachments: [],
    },
    {
      formCode: '0619E',
      agency: 'bir',
      title: 'Monthly Remittance Form for Creditable Income Taxes Withheld (Expanded)',
      description: 'Monthly remittance of expanded withholding tax.',
      purpose: 'Remits EWT withheld from income payments during the month.',
      filingFrequency: 'Monthly',
      requiredAttachments: [],
    },
    {
      formCode: '1601EQ',
      agency: 'bir',
      title: 'Quarterly Remittance Return of Creditable Income Taxes Withheld (Expanded)',
      description: 'Quarterly EWT remittance return.',
      purpose: 'Reconciles and remits quarterly EWT withheld.',
      filingFrequency: 'Quarterly',
      requiredAttachments: ['Form 2307 (per payee, as applicable)'],
    },
    {
      formCode: '1601C',
      agency: 'bir',
      title: 'Monthly Remittance Return of Income Taxes Withheld on Compensation',
      description: 'Monthly remittance of withholding tax on employee compensation.',
      purpose: 'Remits withholding tax on compensation for the month.',
      filingFrequency: 'Monthly',
      requiredAttachments: [],
    },
    {
      formCode: '1701Q',
      agency: 'bir',
      title: 'Quarterly Income Tax Return (Individuals)',
      description: 'Quarterly income tax return for self-employed individuals/professionals.',
      purpose: 'Reports quarterly income and computes quarterly income tax due.',
      filingFrequency: 'Quarterly',
      requiredAttachments: [],
    },
    {
      formCode: '1701',
      agency: 'bir',
      title: 'Annual Income Tax Return (Individuals)',
      description: 'Annual income tax return for individuals.',
      purpose: 'Reports annual income and computes the final income tax due.',
      filingFrequency: 'Annual',
      requiredAttachments: ['Audited financial statements (if applicable)'],
    },
    {
      formCode: '1702Q',
      agency: 'bir',
      title: 'Quarterly Income Tax Return (Corporations/Partnerships)',
      description: 'Quarterly income tax return for corporations and partnerships.',
      purpose: 'Reports quarterly income and computes quarterly income tax due.',
      filingFrequency: 'Quarterly',
      requiredAttachments: [],
    },
    {
      formCode: '1702RT',
      agency: 'bir',
      title: 'Annual Income Tax Return (Corporations — Regular Rate)',
      description: 'Annual income tax return for corporations subject to the regular tax rate.',
      purpose: 'Reports annual income and computes the final income tax due.',
      filingFrequency: 'Annual',
      requiredAttachments: ['Audited financial statements'],
    },
    {
      formCode: '2550Q',
      agency: 'bir',
      title: 'Quarterly Value-Added Tax Return',
      description: 'Quarterly VAT return for VAT-registered taxpayers.',
      purpose: 'Reports quarterly output and input VAT and remits any VAT payable.',
      filingFrequency: 'Quarterly',
      requiredAttachments: [],
    },
    {
      formCode: '2551Q',
      agency: 'bir',
      title: 'Quarterly Percentage Tax Return',
      description: 'Quarterly percentage tax return for non-VAT-registered taxpayers.',
      purpose: 'Reports and remits quarterly percentage tax due under Sec. 116, NIRC.',
      filingFrequency: 'Quarterly',
      requiredAttachments: [],
    },
    {
      formCode: 'SSS_CONTRIBUTION',
      agency: 'sss',
      title: 'SSS Monthly Contribution Remittance',
      description: 'Employer remittance of monthly SSS contributions for all covered employees.',
      purpose: 'Remits the employer and employee share of SSS contributions for the month.',
      filingFrequency: 'Monthly',
      requiredAttachments: [],
    },
    {
      formCode: 'PHILHEALTH_CONTRIBUTION',
      agency: 'philhealth',
      title: 'PhilHealth Monthly Premium Remittance',
      description: 'Employer remittance of monthly PhilHealth premium contributions.',
      purpose: 'Remits the employer and employee share of PhilHealth premiums for the month.',
      filingFrequency: 'Monthly',
      requiredAttachments: [],
    },
    {
      formCode: 'PAGIBIG_CONTRIBUTION',
      agency: 'pagibig',
      title: 'Pag-IBIG Monthly Fund Contribution Remittance',
      description: 'Employer remittance of monthly Pag-IBIG Fund contributions.',
      purpose: 'Remits the employer and employee share of Pag-IBIG contributions for the month.',
      filingFrequency: 'Monthly',
      requiredAttachments: [],
    },
  ];

  for (const form of forms) {
    await prisma.formTemplate.upsert({
      where: { formCode: form.formCode },
      create: form,
      update: form,
    });
  }
}

async function seedPlatformAdmin() {
  const email = process.env.SEED_ADMIN_EMAIL;
  const password = process.env.SEED_ADMIN_PASSWORD;
  if (!email || !password) {
    // eslint-disable-next-line no-console
    console.log(
      'Skipping platform admin seed — set SEED_ADMIN_EMAIL and SEED_ADMIN_PASSWORD env vars to create one.',
    );
    return;
  }

  const passwordHash = await argon2.hash(password, { type: argon2.argon2id });
  await prisma.user.upsert({
    where: { email: email.toLowerCase() },
    create: {
      email: email.toLowerCase(),
      passwordHash,
      firstName: 'Platform',
      lastName: 'Administrator',
      isEmailVerified: true,
      isPlatformAdmin: true,
      status: 'active',
    },
    update: { isPlatformAdmin: true },
  });
}

async function main() {
  await seedRolesAndPermissions();
  await seedTaxRules();
  await seedFormTemplates();
  await seedPlatformAdmin();
}

main()
  .catch((err) => {
    // eslint-disable-next-line no-console
    console.error(err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
