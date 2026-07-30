import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { OnEvent } from '@nestjs/event-emitter';
import { FilingStatus } from '@prisma/client';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from '../../queue/queue-producer.service';

interface CompanyCreatedEvent {
  companyId: string;
}

@Injectable()
export class ComplianceService {
  private readonly logger = new Logger(ComplianceService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProducer: QueueProducerService,
  ) {}

  /**
   * Listens for company.created (emitted by OrgService) and enqueues a
   * compliance-scan job on the BullMQ queue rather than running the scan
   * inline — this keeps company creation requests fast and gives us retry
   * semantics if the scan fails (see Phase 3 §3.1, §4.1).
   */
  @OnEvent('company.created')
  async handleCompanyCreated(event: CompanyCreatedEvent) {
    this.logger.log(`Enqueuing initial compliance scan for company ${event.companyId}`);
    await this.queueProducer.enqueueComplianceScan({ companyId: event.companyId });
  }

  @OnEvent('company.updated')
  async handleCompanyUpdated(event: CompanyCreatedEvent) {
    this.logger.log(`Enqueuing re-scan after profile update for company ${event.companyId}`);
    await this.queueProducer.enqueueComplianceScan({ companyId: event.companyId });
  }

  async getDeadlines(companyId: string, status?: FilingStatus) {
    return this.prisma.filingDeadline.findMany({
      where: { companyId, ...(status ? { status } : {}) },
      orderBy: { dueDate: 'asc' },
    });
  }

  async getComplianceStatus(companyId: string) {
    return this.prisma.complianceStatus.findMany({ where: { companyId } });
  }

  async getFlaggedIssues(companyId: string) {
    return this.prisma.flaggedIssue.findMany({
      where: { companyId },
      orderBy: [{ severity: 'desc' }, { detectedAt: 'desc' }],
    });
  }

  async updateIssueStatus(companyId: string, issueId: string, status: 'acknowledged' | 'resolved' | 'dismissed') {
    const issue = await this.prisma.flaggedIssue.findUnique({ where: { id: issueId } });
    if (!issue || issue.companyId !== companyId) {
      throw new NotFoundException({ code: 'ISSUE_NOT_FOUND', message: 'Flagged issue not found.' });
    }
    return this.prisma.flaggedIssue.update({
      where: { id: issueId },
      data: { status, resolvedAt: status === 'resolved' ? new Date() : issue.resolvedAt },
    });
  }

  /**
   * Runs the automated checks described in the original spec's Module 5:
   * missing filings, duplicate expenses/transactions, VAT misclassification
   * risk. Every finding becomes a flagged_issues row — never a silent data
   * mutation.
   */
  async runComplianceScan(companyId: string): Promise<void> {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return;

    await this.generateFilingDeadlines(companyId, company);
    await this.checkVatClassificationRisk(companyId, company);
    await this.checkDuplicatePayrollRuns(companyId);
    await this.recomputeComplianceStatus(companyId);
  }

  /**
   * Generates the recurring filing_deadlines a company is expected to have,
   * based on its profile (VAT vs non-VAT, whether it currently has active
   * employees), for the next 4 quarters / 12 months. Idempotent: it skips
   * any (companyId, formCode, periodStart, periodEnd) combination that
   * already exists, so re-running the scan never creates duplicates.
   *
   * DUE-DATE VALUES BELOW ARE ILLUSTRATIVE STARTING POINTS mirroring
   * commonly cited BIR/SSS/PhilHealth/Pag-IBIG filing calendars. As with
   * TaxEngineService's seeded rates, an accountant or tax counsel must
   * verify these against the current official filing calendar before this
   * platform is relied on for real compliance tracking — due dates do shift
   * (e.g. BIR's "eFPS taxpayers get extra days" rule, or notice-based
   * extensions), and this generator does not attempt to model that nuance.
   */
  private async generateFilingDeadlines(
    companyId: string,
    company: { vatClassification: string; businessType: string },
  ): Promise<void> {
    const activeEmployeeCount = await this.prisma.employee.count({
      where: { companyId, employmentStatus: 'active' },
    });

    const today = new Date();
    const candidates: Array<{
      formCode: string;
      agency: 'bir' | 'sss' | 'philhealth' | 'pagibig';
      periodStart: Date;
      periodEnd: Date;
      dueDate: Date;
    }> = [];

    // --- Quarterly sales tax (VAT or Percentage Tax), next 4 quarters ---
    for (let q = 0; q < 4; q++) {
      const { periodStart, periodEnd } = this.getQuarter(today, q);
      const dueDate = this.addDays(this.endOfMonth(periodEnd), 25);
      candidates.push({
        formCode: company.vatClassification === 'vat' ? '2550Q' : '2551Q',
        agency: 'bir',
        periodStart,
        periodEnd,
        dueDate,
      });
    }

    // --- Quarterly income tax, next 4 quarters ---
    for (let q = 0; q < 4; q++) {
      const { periodStart, periodEnd } = this.getQuarter(today, q);
      const dueDate = this.addDays(periodEnd, 60);
      candidates.push({
        formCode:
          company.businessType === 'corporation' || company.businessType === 'opc' ? '1702Q' : '1701Q',
        agency: 'bir',
        periodStart,
        periodEnd,
        dueDate,
      });
    }

    // --- Monthly withholding (compensation + EWT if employees present) ---
    if (activeEmployeeCount > 0) {
      for (let m = 0; m < 12; m++) {
        const { periodStart, periodEnd } = this.getMonth(today, m);
        const dueDate = this.addDays(this.endOfMonth(periodEnd), 10);
        candidates.push({ formCode: '1601C', agency: 'bir', periodStart, periodEnd, dueDate });
        candidates.push({ formCode: '0619E', agency: 'bir', periodStart, periodEnd, dueDate });

        candidates.push({
          formCode: 'SSS_CONTRIBUTION',
          agency: 'sss',
          periodStart,
          periodEnd,
          dueDate: this.addDays(this.endOfMonth(periodEnd), 30),
        });
        candidates.push({
          formCode: 'PHILHEALTH_CONTRIBUTION',
          agency: 'philhealth',
          periodStart,
          periodEnd,
          dueDate: this.addDays(this.endOfMonth(periodEnd), 20),
        });
        candidates.push({
          formCode: 'PAGIBIG_CONTRIBUTION',
          agency: 'pagibig',
          periodStart,
          periodEnd,
          dueDate: this.addDays(this.endOfMonth(periodEnd), 15),
        });
      }
    }

    // Batched instead of one findFirst+create pair per candidate (dozens per
    // scan, across 4 quarters/12 months of form types) — a single existence
    // query plus a single createMany replaces up to ~2×N sequential
    // round-trips with 2 total.
    const existing = await this.prisma.filingDeadline.findMany({
      where: { companyId, formCode: { in: candidates.map((c) => c.formCode) } },
      select: { formCode: true, periodStart: true, periodEnd: true },
    });
    const existingKeys = new Set(
      existing.map((e) => `${e.formCode}|${e.periodStart.getTime()}|${e.periodEnd.getTime()}`),
    );
    const toCreate = candidates.filter(
      (c) => !existingKeys.has(`${c.formCode}|${c.periodStart.getTime()}|${c.periodEnd.getTime()}`),
    );
    if (toCreate.length > 0) {
      await this.prisma.filingDeadline.createMany({
        data: toCreate.map((candidate) => ({
          companyId,
          formCode: candidate.formCode,
          agency: candidate.agency,
          periodStart: candidate.periodStart,
          periodEnd: candidate.periodEnd,
          dueDate: candidate.dueDate,
          status: candidate.dueDate < today ? 'overdue' : ('upcoming' as const),
        })),
      });
    }
  }

  private getQuarter(reference: Date, quartersAhead: number): { periodStart: Date; periodEnd: Date } {
    const currentQuarterStartMonth = Math.floor(reference.getMonth() / 3) * 3;
    const targetMonth = currentQuarterStartMonth + quartersAhead * 3;
    const periodStart = new Date(reference.getFullYear(), targetMonth, 1);
    const periodEnd = new Date(reference.getFullYear(), targetMonth + 3, 0);
    return { periodStart, periodEnd };
  }

  private getMonth(reference: Date, monthsAhead: number): { periodStart: Date; periodEnd: Date } {
    const periodStart = new Date(reference.getFullYear(), reference.getMonth() + monthsAhead, 1);
    const periodEnd = new Date(reference.getFullYear(), reference.getMonth() + monthsAhead + 1, 0);
    return { periodStart, periodEnd };
  }

  private endOfMonth(date: Date): Date {
    return new Date(date.getFullYear(), date.getMonth() + 1, 0);
  }

  private addDays(date: Date, days: number): Date {
    const result = new Date(date);
    result.setDate(result.getDate() + days);
    return result;
  }

  private async checkVatClassificationRisk(
    companyId: string,
    company: { vatClassification: string },
  ): Promise<void> {
    // Illustrative rule: if a company is non-VAT but has confirmed tax
    // computations whose gross sales exceed the VAT threshold rule
    // (VAT_REGISTRATION_THRESHOLD, seeded in tax_engine.tax_rules), flag it.
    const thresholdRule = await this.prisma.taxRule.findFirst({
      where: { ruleCode: 'VAT_REGISTRATION_THRESHOLD' },
      include: { ratesHistory: true },
    });
    if (!thresholdRule || thresholdRule.ratesHistory.length === 0) return; // rule not seeded — nothing to check against

    if (company.vatClassification === 'vat') return;

    const threshold = Number(thresholdRule.ratesHistory[0].rateValue);
    const recentComputations = await this.prisma.taxComputation.findMany({
      where: { companyId, status: 'confirmed' },
      orderBy: { periodEnd: 'desc' },
      take: 12,
    });

    const totalGrossSales = recentComputations.reduce((sum, c) => {
      const inputs = c.inputs as { grossSales?: number; grossReceipts?: number };
      return sum + (inputs.grossSales ?? inputs.grossReceipts ?? 0);
    }, 0);

    if (totalGrossSales > threshold) {
      const alreadyFlagged = await this.prisma.flaggedIssue.findFirst({
        where: { companyId, issueType: 'vat_misclassification', status: 'open' },
      });
      if (!alreadyFlagged) {
        await this.prisma.flaggedIssue.create({
          data: {
            companyId,
            issueType: 'vat_misclassification',
            severity: 'high',
            description: `Trailing gross sales/receipts (₱${totalGrossSales.toLocaleString()}) exceed the VAT registration threshold (₱${threshold.toLocaleString()}) while this company is classified non-VAT.`,
            recommendedAction:
              'Review VAT registration requirements with your accountant; mandatory VAT registration may now apply.',
          },
        });
      }
    }
  }

  private async checkDuplicatePayrollRuns(companyId: string): Promise<void> {
    const runs = await this.prisma.payrollRun.findMany({
      where: { companyId },
      orderBy: { periodStart: 'asc' },
    });

    const seenPeriods = new Set<string>();
    for (const run of runs) {
      const key = `${run.periodStart.toISOString()}_${run.periodEnd.toISOString()}`;
      if (seenPeriods.has(key)) {
        const alreadyFlagged = await this.prisma.flaggedIssue.findFirst({
          where: {
            companyId,
            issueType: 'duplicate_transaction',
            relatedEntityId: run.id,
            status: 'open',
          },
        });
        if (!alreadyFlagged) {
          await this.prisma.flaggedIssue.create({
            data: {
              companyId,
              issueType: 'duplicate_transaction',
              severity: 'medium',
              description: `A payroll run already exists for period ${run.periodStart.toDateString()} – ${run.periodEnd.toDateString()}.`,
              recommendedAction: 'Review both payroll runs and void the duplicate if confirmed.',
              relatedEntityType: 'payroll_run',
              relatedEntityId: run.id,
            },
          });
        }
      }
      seenPeriods.add(key);
    }
  }

  private async recomputeComplianceStatus(companyId: string): Promise<void> {
    const deadlines = await this.prisma.filingDeadline.findMany({ where: { companyId } });
    const byCategory = new Map<string, { completed: number; pending: number; missing: number; overdue: number }>();

    for (const d of deadlines) {
      const category = d.agency.toUpperCase();
      const bucket = byCategory.get(category) ?? { completed: 0, pending: 0, missing: 0, overdue: 0 };
      if (d.status === 'filed') bucket.completed++;
      else if (d.status === 'overdue') bucket.overdue++;
      else bucket.pending++;
      byCategory.set(category, bucket);
    }

    for (const [category, counts] of byCategory.entries()) {
      const total = counts.completed + counts.pending + counts.missing + counts.overdue;
      const percentage = total > 0 ? Number(((counts.completed / total) * 100).toFixed(2)) : 100;

      const existing = await this.prisma.complianceStatus.findFirst({ where: { companyId, category } });
      if (existing) {
        await this.prisma.complianceStatus.update({
          where: { id: existing.id },
          data: {
            completedCount: counts.completed,
            pendingCount: counts.pending,
            missingCount: counts.missing,
            overdueCount: counts.overdue,
            compliancePercentage: percentage,
            lastComputedAt: new Date(),
          },
        });
      } else {
        await this.prisma.complianceStatus.create({
          data: {
            companyId,
            category,
            completedCount: counts.completed,
            pendingCount: counts.pending,
            missingCount: counts.missing,
            overdueCount: counts.overdue,
            compliancePercentage: percentage,
          },
        });
      }
    }
  }
}
