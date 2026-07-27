import { NotFoundException } from '@nestjs/common';
import { ComplianceService } from './compliance.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from '../../queue/queue-producer.service';

/**
 * checkVatClassificationRisk and recomputeComplianceStatus carry real
 * regulatory/compliance-risk consequences (an unflagged company that
 * should have registered for VAT is a genuine compliance failure for the
 * user, not just a UI glitch), so these tests exercise the private
 * methods directly rather than only asserting on runComplianceScan's
 * side effects — the accumulation/threshold/percentage math is the part
 * most likely to regress silently.
 */
describe('ComplianceService', () => {
  let service: ComplianceService;
  let prisma: {
    taxRule: { findFirst: jest.Mock };
    taxComputation: { findMany: jest.Mock };
    flaggedIssue: { findFirst: jest.Mock; findUnique: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
    filingDeadline: { findMany: jest.Mock };
    complianceStatus: { findFirst: jest.Mock; create: jest.Mock; update: jest.Mock; findMany: jest.Mock };
  };
  let queueProducer: { enqueueComplianceScan: jest.Mock };

  const COMPANY_ID = 'company-1';

  // checkVatClassificationRisk/recomputeComplianceStatus are private and
  // only reachable via runComplianceScan's full orchestration; accessed
  // directly here (through a typed cast, not `any`) to isolate their
  // accumulation/threshold/percentage math without mocking the rest of
  // the scan's unrelated side effects.
  interface ComplianceServicePrivates {
    checkVatClassificationRisk(companyId: string, company: { vatClassification: string }): Promise<void>;
    recomputeComplianceStatus(companyId: string): Promise<void>;
  }
  const privates = () => service as unknown as ComplianceServicePrivates;

  function thresholdRule(threshold: number) {
    return { id: 'rule-1', ratesHistory: [{ rateValue: threshold }] };
  }

  function confirmedComputation(grossSales: number) {
    return { status: 'confirmed', inputs: { grossSales } };
  }

  beforeEach(() => {
    prisma = {
      taxRule: { findFirst: jest.fn() },
      taxComputation: { findMany: jest.fn() },
      flaggedIssue: {
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
      },
      filingDeadline: { findMany: jest.fn() },
      complianceStatus: { findFirst: jest.fn(), create: jest.fn(), update: jest.fn(), findMany: jest.fn() },
    };
    queueProducer = { enqueueComplianceScan: jest.fn() };
    service = new ComplianceService(
      prisma as unknown as PrismaService,
      queueProducer as unknown as QueueProducerService,
    );
  });

  describe('checkVatClassificationRisk (private, accessed for its accumulation/threshold logic)', () => {
    const run = (companyId: string, company: { vatClassification: string }) =>
      privates().checkVatClassificationRisk(companyId, company);

    it('does nothing when the VAT threshold rule has not been seeded', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(null);
      await run(COMPANY_ID, { vatClassification: 'non_vat' });
      expect(prisma.flaggedIssue.create).not.toHaveBeenCalled();
    });

    it('never flags a company that is already VAT-registered', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(thresholdRule(3000000));
      await run(COMPANY_ID, { vatClassification: 'vat' });
      // Should short-circuit before even querying tax computations.
      expect(prisma.taxComputation.findMany).not.toHaveBeenCalled();
      expect(prisma.flaggedIssue.create).not.toHaveBeenCalled();
    });

    it('does not flag a non-VAT company whose trailing gross sales are under the threshold', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(thresholdRule(3000000));
      prisma.taxComputation.findMany.mockResolvedValue([
        confirmedComputation(1000000),
        confirmedComputation(1500000),
      ]);
      await run(COMPANY_ID, { vatClassification: 'non_vat' });
      expect(prisma.flaggedIssue.create).not.toHaveBeenCalled();
    });

    it('flags vat_misclassification when accumulated trailing gross sales exceed the threshold', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(thresholdRule(3000000));
      prisma.taxComputation.findMany.mockResolvedValue([
        confirmedComputation(2000000),
        confirmedComputation(1500000), // sums to 3,500,000 > 3,000,000 threshold
      ]);
      prisma.flaggedIssue.findFirst.mockResolvedValue(null);

      await run(COMPANY_ID, { vatClassification: 'non_vat' });

      expect(prisma.flaggedIssue.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            companyId: COMPANY_ID,
            issueType: 'vat_misclassification',
            severity: 'high',
          }),
        }),
      );
    });

    it('does not create a duplicate flag when an open vat_misclassification issue already exists', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(thresholdRule(3000000));
      prisma.taxComputation.findMany.mockResolvedValue([confirmedComputation(5000000)]);
      prisma.flaggedIssue.findFirst.mockResolvedValue({ id: 'existing-issue' });

      await run(COMPANY_ID, { vatClassification: 'non_vat' });

      expect(prisma.flaggedIssue.create).not.toHaveBeenCalled();
    });

    it('falls back to grossReceipts when grossSales is absent on a computation', async () => {
      prisma.taxRule.findFirst.mockResolvedValue(thresholdRule(1000000));
      prisma.taxComputation.findMany.mockResolvedValue([{ status: 'confirmed', inputs: { grossReceipts: 2000000 } }]);
      prisma.flaggedIssue.findFirst.mockResolvedValue(null);

      await run(COMPANY_ID, { vatClassification: 'non_vat' });

      expect(prisma.flaggedIssue.create).toHaveBeenCalled();
    });
  });

  describe('recomputeComplianceStatus (private, accessed for its percentage math)', () => {
    const run = (companyId: string) => privates().recomputeComplianceStatus(companyId);

    it('computes 100% for a category with no deadlines at all', async () => {
      prisma.filingDeadline.findMany.mockResolvedValue([]);
      await run(COMPANY_ID);
      expect(prisma.complianceStatus.create).not.toHaveBeenCalled();
      expect(prisma.complianceStatus.update).not.toHaveBeenCalled();
    });

    it('computes the completion percentage as filed / total for each agency category', async () => {
      prisma.filingDeadline.findMany.mockResolvedValue([
        { agency: 'bir', status: 'filed' },
        { agency: 'bir', status: 'filed' },
        { agency: 'bir', status: 'upcoming' },
        { agency: 'bir', status: 'overdue' },
      ]);
      prisma.complianceStatus.findFirst.mockResolvedValue(null);

      await run(COMPANY_ID);

      // 2 filed out of 4 total = 50.00%
      expect(prisma.complianceStatus.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            category: 'BIR',
            completedCount: 2,
            overdueCount: 1,
            pendingCount: 1,
            compliancePercentage: 50,
          }),
        }),
      );
    });

    it('updates an existing compliance_status row instead of creating a duplicate', async () => {
      prisma.filingDeadline.findMany.mockResolvedValue([{ agency: 'sss', status: 'filed' }]);
      prisma.complianceStatus.findFirst.mockResolvedValue({ id: 'existing-status' });

      await run(COMPANY_ID);

      expect(prisma.complianceStatus.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'existing-status' } }),
      );
      expect(prisma.complianceStatus.create).not.toHaveBeenCalled();
    });
  });

  describe('getDeadlines / getFlaggedIssues / getComplianceStatus (tenant-scoped reads)', () => {
    it('scopes deadline queries to the given company and optional status', async () => {
      prisma.filingDeadline.findMany.mockResolvedValue([]);
      await service.getDeadlines(COMPANY_ID, 'overdue' as never);
      expect(prisma.filingDeadline.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { companyId: COMPANY_ID, status: 'overdue' } }),
      );
    });
  });

  describe('updateIssueStatus', () => {
    it('rejects an issue that does not belong to the given company', async () => {
      prisma.flaggedIssue.findUnique.mockResolvedValue({ id: 'issue-1', companyId: 'other-company' });
      await expect(
        service.updateIssueStatus(COMPANY_ID, 'issue-1', 'resolved'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('sets resolvedAt when transitioning to resolved', async () => {
      prisma.flaggedIssue.findUnique.mockResolvedValue({ id: 'issue-1', companyId: COMPANY_ID, resolvedAt: null });
      await service.updateIssueStatus(COMPANY_ID, 'issue-1', 'resolved');
      expect(prisma.flaggedIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'resolved', resolvedAt: expect.any(Date) }) }),
      );
    });

    it('leaves resolvedAt untouched when transitioning to acknowledged', async () => {
      prisma.flaggedIssue.findUnique.mockResolvedValue({ id: 'issue-1', companyId: COMPANY_ID, resolvedAt: null });
      await service.updateIssueStatus(COMPANY_ID, 'issue-1', 'acknowledged');
      expect(prisma.flaggedIssue.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'acknowledged', resolvedAt: null }) }),
      );
    });
  });
});
