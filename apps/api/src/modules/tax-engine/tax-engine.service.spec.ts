import { TaxEngineService } from './tax-engine.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';
import { ComputationTypeDto, ComputeTaxDto } from './dto/compute-tax.dto';

/**
 * TaxEngineService is the core rule-driven computation used by both the
 * standalone tax-computation endpoints and PayrollService's per-employee
 * contribution/withholding math. A silent regression here means presenting
 * a wrong peso amount to a real taxpayer, so these tests pin down the exact
 * arithmetic (flat-rate multiplication, marginal-bracket allocation) rather
 * than just checking "a number came back".
 */
describe('TaxEngineService', () => {
  let service: TaxEngineService;
  let prisma: { taxRule: { findFirst: jest.Mock }; company: { findUniqueOrThrow: jest.Mock }; taxComputation: { create: jest.Mock } };
  let rabbitMq: { publish: jest.Mock };

  const PERIOD_START = new Date('2024-01-01');
  const PERIOD_END = new Date('2024-01-31');

  function flatRateRule(rateValue: number) {
    return {
      id: 'rule-flat-1',
      sourceReference: 'TEST_SOURCE',
      ratesHistory: [{ rateValue, bracketMin: null, bracketMax: null }],
    };
  }

  // Mirrors the seeded INCOME_TAX_BRACKETS / WITHHOLDING_COMP_BRACKETS shape:
  // marginal rates over successive income bands.
  function bracketRule() {
    return {
      id: 'rule-bracket-1',
      sourceReference: 'TEST_SOURCE',
      ratesHistory: [
        { rateValue: 0, bracketMin: 0, bracketMax: 250000 },
        { rateValue: 0.15, bracketMin: 250000, bracketMax: 400000 },
        { rateValue: 0.2, bracketMin: 400000, bracketMax: 800000 },
        { rateValue: 0.25, bracketMin: 800000, bracketMax: 2000000 },
        { rateValue: 0.3, bracketMin: 2000000, bracketMax: 8000000 },
        { rateValue: 0.35, bracketMin: 8000000, bracketMax: null },
      ],
    };
  }

  beforeEach(() => {
    prisma = {
      taxRule: { findFirst: jest.fn() },
      company: { findUniqueOrThrow: jest.fn() },
      taxComputation: { create: jest.fn() },
    };
    rabbitMq = { publish: jest.fn() };
    service = new TaxEngineService(
      prisma as unknown as PrismaService,
      rabbitMq as unknown as RabbitMqService,
    );
  });

  describe('computeFlatRateAmount', () => {
    it('multiplies base by the active rate and rounds to 2 decimals', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(flatRateRule(0.045)); // SSS-shaped rate
      const result = await service.computeFlatRateAmount('SSS_EMPLOYEE_CONTRIBUTION_RATE', 25000, PERIOD_END);
      expect(result.missingInputs).toEqual([]);
      expect(result.result).toBeCloseTo(1125, 2); // 25000 * 0.045
      expect(result.ruleIdsUsed).toEqual(['rule-flat-1']);
    });

    it('reports tax_rule_not_configured when no active rule exists', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(null);
      const result = await service.computeFlatRateAmount('MISSING_RULE', 10000, PERIOD_END);
      expect(result.result).toBeNull();
      expect(result.missingInputs).toContain('tax_rule_not_configured:MISSING_RULE');
    });

    it('reports tax_rule_not_configured when the rule has no rate history for the period', async () => {
      prisma.taxRule.findFirst.mockResolvedValue({ id: 'rule-x', ratesHistory: [] });
      const result = await service.computeFlatRateAmount('EXPIRED_RULE', 10000, PERIOD_END);
      expect(result.result).toBeNull();
      expect(result.missingInputs).toContain('tax_rule_not_configured:EXPIRED_RULE');
    });

    it('flags a missing base amount even when the rule is configured, without computing a result', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(flatRateRule(0.12));
      const result = await service.computeFlatRateAmount('VAT_RATE', undefined, PERIOD_END);
      expect(result.result).toBeNull();
      expect(result.missingInputs).toContain('VAT_RATE');
    });
  });

  describe('computeGraduatedAmount (marginal bracket math)', () => {
    beforeEach(() => {
      prisma.taxRule.findFirst.mockResolvedValue(bracketRule());
    });

    it('is zero for income entirely within the 0% bracket', async () => {
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 250000, PERIOD_END);
      expect(result.result).toBe(0);
    });

    it('taxes only the portion above the first bracket boundary', async () => {
      // 300,000: 15% of the 50,000 above the 250,000 threshold = 7,500
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 300000, PERIOD_END);
      expect(result.result).toBeCloseTo(7500, 2);
    });

    it('accumulates tax across multiple brackets (matches BIR TRAIN table checkpoint)', async () => {
      // 500,000: bracket1 (0-250k)=0, bracket2 (250k-400k)=22,500, bracket3 100k of 20% = 20,000
      // Total = 42,500 — matches the published 22,500 + 20% of excess over 400,000 formula.
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 500000, PERIOD_END);
      expect(result.result).toBeCloseTo(42500, 2);
    });

    it('handles income exactly at a bracket boundary without double-counting', async () => {
      // 400,000 exactly: only 150,000 taxed at 15% = 22,500, none of bracket 3 applies
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 400000, PERIOD_END);
      expect(result.result).toBeCloseTo(22500, 2);
    });

    it('applies the top marginal rate for income in the unbounded top bracket', async () => {
      // 10,000,000: brackets 1-5 total to 2,202,500, plus 35% of the 2,000,000 above 8,000,000 = 700,000
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 10000000, PERIOD_END);
      // bracket totals: 0 + 22,500 + 80,000 + 300,000 + 1,800,000 = 2,202,500; +700,000 = 2,902,500
      expect(result.result).toBeCloseTo(2902500, 2);
    });

    it('is zero for zero income', async () => {
      const result = await service.computeGraduatedAmount('INCOME_TAX_BRACKETS', 0, PERIOD_END);
      expect(result.result).toBe(0);
    });
  });

  describe('compute() — VAT/percentage-tax classification consistency', () => {
    function dto(overrides: Partial<ComputeTaxDto> = {}): ComputeTaxDto {
      return {
        computationType: ComputationTypeDto.vat,
        periodStart: PERIOD_START.toISOString(),
        periodEnd: PERIOD_END.toISOString(),
        grossSales: 1000000,
        ...overrides,
      } as ComputeTaxDto;
    }

    beforeEach(() => {
      prisma.taxComputation.create.mockImplementation(({ data }: { data: unknown }) => data);
    });

    it('computes VAT cleanly for a VAT-registered company (no classification warning)', async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: 'c1', vatClassification: 'vat' });
      prisma.taxRule.findFirst.mockResolvedValue(flatRateRule(0.12));

      const record = await service.compute('c1', dto());

      expect(record.result).toBeCloseTo(120000, 2); // 1,000,000 * 12%
      expect(record.missingInputs).toEqual([]);
    });

    it('still returns the computed VAT amount but flags a classification warning for a non-VAT company', async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: 'c1', vatClassification: 'non_vat' });
      prisma.taxRule.findFirst.mockResolvedValue(flatRateRule(0.12));

      const record = await service.compute('c1', dto());

      // The result is still computed (a warning is not the same as a missing input),
      // but callers/UI must surface the mismatch flag.
      expect(record.result).toBeCloseTo(120000, 2);
      expect(record.missingInputs.some((m: string) => m.startsWith('company_not_vat_registered'))).toBe(true);
    });

    it('flags a warning when percentage tax is computed for a VAT-registered company', async () => {
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: 'c1', vatClassification: 'vat' });
      prisma.taxRule.findFirst.mockResolvedValue(flatRateRule(0.03));

      const record = await service.compute('c1', dto({ computationType: ComputationTypeDto.percentage_tax }));

      expect(record.missingInputs.some((m: string) => m.startsWith('company_is_vat_registered'))).toBe(true);
    });
  });

  describe('compute() — income tax deduction derivation', () => {
    beforeEach(() => {
      prisma.taxComputation.create.mockImplementation(({ data }: { data: unknown }) => data);
      prisma.company.findUniqueOrThrow.mockResolvedValue({ id: 'c1', vatClassification: 'non_vat' });
      prisma.taxRule.findFirst.mockResolvedValue(bracketRule());
    });

    it('derives net taxable income as grossSales minus businessExpenses and otherDeductions', async () => {
      const record = await service.compute('c1', {
        computationType: ComputationTypeDto.income_tax,
        periodStart: PERIOD_START.toISOString(),
        periodEnd: PERIOD_END.toISOString(),
        grossSales: 600000,
        businessExpenses: 150000,
        otherDeductions: 50000,
      } as ComputeTaxDto);

      // net taxable = 600,000 - 150,000 - 50,000 = 400,000 -> tax = 22,500 (see bracket test above)
      expect(record.result).toBeCloseTo(22500, 2);
    });

    it('floors net taxable income at zero when deductions exceed gross income', async () => {
      const record = await service.compute('c1', {
        computationType: ComputationTypeDto.income_tax,
        periodStart: PERIOD_START.toISOString(),
        periodEnd: PERIOD_END.toISOString(),
        grossSales: 100000,
        businessExpenses: 500000,
      } as ComputeTaxDto);

      expect(record.result).toBe(0);
    });

    it('reports a missing base when neither grossSales nor grossReceipts is provided', async () => {
      const record = await service.compute('c1', {
        computationType: ComputationTypeDto.income_tax,
        periodStart: PERIOD_START.toISOString(),
        periodEnd: PERIOD_END.toISOString(),
      } as ComputeTaxDto);

      expect(record.result).toBeNull();
      expect(record.missingInputs).toContain('grossSales or grossReceipts');
    });
  });
});
