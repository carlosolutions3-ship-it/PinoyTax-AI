import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';
import { ComputeTaxDto, ComputationTypeDto } from './dto/compute-tax.dto';

interface EngineResult {
  result: number | null;
  missingInputs: string[];
  ruleIdsUsed: string[];
  breakdown: Record<string, unknown>;
}

/**
 * IMPORTANT — read before modifying:
 *
 * This engine NEVER hardcodes a tax rate, bracket, or deadline rule directly
 * in application code. Every numeric rate/bracket is read from
 * tax_engine.tax_rules + tax_engine.tax_rates_history, which must be
 * populated (see prisma/seed.ts for a starting seed and its citations) and
 * kept current by whoever owns regulatory content for this platform.
 *
 * If a required rule is not found for the given period, the engine reports
 * it via `missingInputs` rather than falling back to any default — silently
 * guessing a rate is exactly the failure mode this architecture exists to
 * prevent (see Phase 1 §6.2 and the AI Design Principles in the original
 * product spec).
 *
 * This is a REFERENCE IMPLEMENTATION for common cases (flat-rate VAT and
 * percentage tax, graduated income tax / compensation withholding). It is
 * NOT a certified BIR computation product — expanded withholding tax (EWT)
 * in particular has many income-payment-type-specific rates that a real
 * deployment must model as distinct rule codes (e.g. EWT_PROFESSIONAL_FEES,
 * EWT_RENTALS) rather than the single illustrative EWT_RATE_DEFAULT used
 * here. Treat this module as a scaffold to extend with an accountant's or
 * tax counsel's sign-off before relying on its output for real filings.
 */
@Injectable()
export class TaxEngineService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  async compute(companyId: string, dto: ComputeTaxDto) {
    const company = await this.prisma.company.findUniqueOrThrow({ where: { id: companyId } });
    const periodStart = new Date(dto.periodStart);
    const periodEnd = new Date(dto.periodEnd);

    let engineResult: EngineResult;

    switch (dto.computationType) {
      case ComputationTypeDto.vat:
        engineResult = await this.computeFlatRate(
          'VAT_RATE',
          dto.grossSales ?? dto.grossReceipts,
          'grossSales or grossReceipts',
          periodStart,
          periodEnd,
        );
        if (company.vatClassification !== 'vat') {
          engineResult.missingInputs.push(
            'company_not_vat_registered: this company is classified non-VAT; percentage tax may apply instead',
          );
        }
        break;

      case ComputationTypeDto.percentage_tax:
        engineResult = await this.computeFlatRate(
          'PERCENTAGE_TAX_RATE',
          dto.grossSales ?? dto.grossReceipts,
          'grossSales or grossReceipts',
          periodStart,
          periodEnd,
        );
        if (company.vatClassification === 'vat') {
          engineResult.missingInputs.push(
            'company_is_vat_registered: this company is VAT-registered; percentage tax typically does not apply',
          );
        }
        break;

      case ComputationTypeDto.ewt:
        engineResult = await this.computeFlatRate(
          'EWT_RATE_DEFAULT',
          dto.businessExpenses,
          'businessExpenses (income payments subject to EWT)',
          periodStart,
          periodEnd,
        );
        break;

      case ComputationTypeDto.withholding_comp:
        engineResult = await this.computeGraduated(
          'WITHHOLDING_COMP_BRACKETS',
          dto.payrollExpenses,
          'payrollExpenses (taxable compensation for the period)',
          periodStart,
          periodEnd,
        );
        break;

      case ComputationTypeDto.income_tax: {
        const grossBase = dto.grossSales ?? dto.grossReceipts;
        if (grossBase == null) {
          engineResult = {
            result: null,
            missingInputs: ['grossSales or grossReceipts'],
            ruleIdsUsed: [],
            breakdown: {},
          };
          break;
        }
        const deductions = (dto.businessExpenses ?? 0) + (dto.otherDeductions ?? 0);
        const netTaxableIncome = Math.max(grossBase - deductions, 0);
        engineResult = await this.computeGraduated(
          'INCOME_TAX_BRACKETS',
          netTaxableIncome,
          'netTaxableIncome (derived from grossSales/grossReceipts minus deductions)',
          periodStart,
          periodEnd,
        );
        break;
      }
    }

    const record = await this.prisma.taxComputation.create({
      data: {
        companyId,
        computationType: dto.computationType,
        periodStart,
        periodEnd,
        inputs: dto as unknown as object,
        ruleIdsUsed: engineResult.ruleIdsUsed,
        result: engineResult.result,
        missingInputs: engineResult.missingInputs,
        status: 'draft',
      },
    });

    return { ...record, breakdown: engineResult.breakdown };
  }

  /**
   * Public entry point for other modules (notably Payroll) that need a
   * rule-driven flat-rate amount without creating a tax_computations record
   * (e.g. per-employee SSS/PhilHealth/Pag-IBIG contributions belong on the
   * payslip, not the company-level tax filing ledger).
   */
  async computeFlatRateAmount(ruleCode: string, base: number | undefined, asOf: Date) {
    return this.computeFlatRate(ruleCode, base, ruleCode, asOf, asOf);
  }

  /** Public entry point mirroring computeFlatRateAmount for graduated/bracketed rules. */
  async computeGraduatedAmount(ruleCode: string, base: number | undefined, asOf: Date) {
    return this.computeGraduated(ruleCode, base, ruleCode, asOf, asOf);
  }

  async confirm(companyId: string, taxComputationId: string) {
    const existing = await this.prisma.taxComputation.findUnique({ where: { id: taxComputationId } });
    if (!existing || existing.companyId !== companyId) {
      throw new NotFoundException({
        code: 'TAX_COMPUTATION_NOT_FOUND',
        message: 'Tax computation not found.',
      });
    }

    const updated = await this.prisma.taxComputation.update({
      where: { id: taxComputationId },
      data: { status: 'confirmed' },
    });
    await this.rabbitMq.publish('tax_computation.confirmed', {
      taxComputationId: updated.id,
      companyId: updated.companyId,
      computationType: updated.computationType,
    });
    return updated;
  }

  async listForCompany(companyId: string) {
    return this.prisma.taxComputation.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
    });
  }

  async getById(companyId: string, taxComputationId: string) {
    const computation = await this.prisma.taxComputation.findUnique({
      where: { id: taxComputationId },
    });
    if (!computation || computation.companyId !== companyId) {
      throw new NotFoundException({
        code: 'TAX_COMPUTATION_NOT_FOUND',
        message: 'Tax computation not found.',
      });
    }
    return computation;
  }

  private async findActiveRule(ruleCode: string, asOf: Date) {
    return this.prisma.taxRule.findFirst({
      where: {
        ruleCode,
        effectiveFrom: { lte: asOf },
        OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
      },
      include: {
        ratesHistory: {
          where: {
            effectiveFrom: { lte: asOf },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: asOf } }],
          },
        },
      },
    });
  }

  private async computeFlatRate(
    ruleCode: string,
    base: number | undefined,
    baseFieldLabel: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<EngineResult> {
    const missingInputs: string[] = [];
    if (base == null) missingInputs.push(baseFieldLabel);

    const rule = await this.findActiveRule(ruleCode, periodEnd);
    if (!rule || rule.ratesHistory.length === 0) {
      missingInputs.push(`tax_rule_not_configured:${ruleCode}`);
    }

    if (missingInputs.length > 0 || !rule) {
      return { result: null, missingInputs, ruleIdsUsed: rule ? [rule.id] : [], breakdown: {} };
    }

    const rate = Number(rule.ratesHistory[0].rateValue);
    const result = Number((base! * rate).toFixed(2));

    return {
      result,
      missingInputs: [],
      ruleIdsUsed: [rule.id],
      breakdown: {
        ruleCode,
        sourceReference: rule.sourceReference,
        base,
        rate,
        formula: `${baseFieldLabel} (${base}) x rate (${rate}) = ${result}`,
        periodStart,
        periodEnd,
      },
    };
  }

  private async computeGraduated(
    ruleCode: string,
    base: number | undefined,
    baseFieldLabel: string,
    periodStart: Date,
    periodEnd: Date,
  ): Promise<EngineResult> {
    const missingInputs: string[] = [];
    if (base == null) missingInputs.push(baseFieldLabel);

    const rule = await this.findActiveRule(ruleCode, periodEnd);
    if (!rule || rule.ratesHistory.length === 0) {
      missingInputs.push(`tax_rule_not_configured:${ruleCode}`);
    }

    if (missingInputs.length > 0 || !rule) {
      return { result: null, missingInputs, ruleIdsUsed: rule ? [rule.id] : [], breakdown: {} };
    }

    // Sort brackets ascending by bracketMin and apply marginal-rate logic.
    const brackets = [...rule.ratesHistory].sort(
      (a, b) => Number(a.bracketMin ?? 0) - Number(b.bracketMin ?? 0),
    );

    let remaining = base!;
    let total = 0;
    const appliedBrackets: Record<string, unknown>[] = [];

    for (const bracket of brackets) {
      const min = Number(bracket.bracketMin ?? 0);
      const max = bracket.bracketMax != null ? Number(bracket.bracketMax) : Infinity;
      if (base! <= min) continue;

      const taxableInThisBracket = Math.min(base!, max) - min;
      if (taxableInThisBracket <= 0) continue;

      const rate = Number(bracket.rateValue);
      const taxForBracket = Number((taxableInThisBracket * rate).toFixed(2));
      total += taxForBracket;
      appliedBrackets.push({ min, max: max === Infinity ? null : max, rate, taxForBracket });
      remaining -= taxableInThisBracket;
      if (remaining <= 0) break;
    }

    return {
      result: Number(total.toFixed(2)),
      missingInputs: [],
      ruleIdsUsed: [rule.id],
      breakdown: {
        ruleCode,
        sourceReference: rule.sourceReference,
        base,
        appliedBrackets,
        periodStart,
        periodEnd,
      },
    };
  }
}
