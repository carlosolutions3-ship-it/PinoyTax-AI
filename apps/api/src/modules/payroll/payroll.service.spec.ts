import { BadRequestException, ConflictException, NotFoundException } from '@nestjs/common';
import { PayrollService } from './payroll.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';

/**
 * PayrollService.computePayrollRun withholds real money from real employees'
 * pay, so the two properties that matter most are: (1) a missing statutory
 * number (SSS/PhilHealth/Pag-IBIG) or an unconfigured tax rule must NEVER be
 * silently treated as "contribution = 0 and no one is told" — it must show
 * up as an explicit error the run can't finalize with — and (2) netPay must
 * always reconcile exactly with grossPay minus the summed deductions.
 */
describe('PayrollService', () => {
  let service: PayrollService;
  let prisma: {
    payrollRun: { findUnique: jest.Mock; update: jest.Mock };
    employee: { findMany: jest.Mock };
    payslip: { deleteMany: jest.Mock; create: jest.Mock };
  };
  let taxEngine: { computeFlatRateAmount: jest.Mock; computeGraduatedAmount: jest.Mock };
  let rabbitMq: { publish: jest.Mock };

  const COMPANY_ID = 'company-1';
  const RUN_ID = 'run-1';

  const baseEmployee = {
    id: 'emp-1',
    companyId: COMPANY_ID,
    basicSalary: 30000,
    sssNumber: '01-2345678-9',
    philhealthNumber: 'PH-001',
    pagibigNumber: 'PI-001',
  };

  function flatResult(result: number) {
    return { result, missingInputs: [], ruleIdsUsed: ['r1'], breakdown: {} };
  }

  function missingRule(code: string) {
    return { result: null, missingInputs: [`tax_rule_not_configured:${code}`], ruleIdsUsed: [], breakdown: {} };
  }

  beforeEach(() => {
    prisma = {
      payrollRun: { findUnique: jest.fn(), update: jest.fn() },
      employee: { findMany: jest.fn() },
      payslip: { deleteMany: jest.fn(), create: jest.fn() },
    };
    taxEngine = { computeFlatRateAmount: jest.fn(), computeGraduatedAmount: jest.fn() };
    rabbitMq = { publish: jest.fn() };
    service = new PayrollService(
      prisma as unknown as PrismaService,
      taxEngine as unknown as TaxEngineService,
      rabbitMq as unknown as RabbitMqService,
    );

    prisma.payrollRun.findUnique.mockResolvedValue({
      id: RUN_ID,
      companyId: COMPANY_ID,
      status: 'draft',
      periodEnd: new Date('2024-01-31'),
    });
    prisma.payrollRun.update.mockResolvedValue({});
    prisma.payslip.deleteMany.mockResolvedValue({ count: 0 });
    prisma.payslip.create.mockImplementation(({ data }: { data: unknown }) => data);
  });

  describe('computePayrollRun', () => {
    it('throws NotFoundException when the run does not belong to the company', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ id: RUN_ID, companyId: 'other-company' });
      await expect(service.computePayrollRun(COMPANY_ID, RUN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFoundException when the run does not exist', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue(null);
      await expect(service.computePayrollRun(COMPANY_ID, RUN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it.each(['finalized', 'paid'])('refuses to recompute a %s run', async (status) => {
      prisma.payrollRun.findUnique.mockResolvedValue({ id: RUN_ID, companyId: COMPANY_ID, status });
      await expect(service.computePayrollRun(COMPANY_ID, RUN_ID)).rejects.toBeInstanceOf(ConflictException);
    });

    it('clears prior draft payslips before recomputing', async () => {
      prisma.employee.findMany.mockResolvedValue([]);
      await service.computePayrollRun(COMPANY_ID, RUN_ID);
      expect(prisma.payslip.deleteMany).toHaveBeenCalledWith({ where: { payrollRunId: RUN_ID } });
    });

    it('computes a fully-resolved payslip with netPay reconciling to grossPay minus deductions', async () => {
      prisma.employee.findMany.mockResolvedValue([baseEmployee]);
      taxEngine.computeGraduatedAmount.mockImplementation((ruleCode: string) => {
        if (ruleCode === 'SSS_EMPLOYEE_CONTRIBUTION_RATE') return Promise.resolve(flatResult(1350));
        if (ruleCode === 'PHILHEALTH_EMPLOYEE_CONTRIBUTION_RATE') return Promise.resolve(flatResult(750));
        if (ruleCode === 'PAGIBIG_EMPLOYEE_CONTRIBUTION_RATE') return Promise.resolve(flatResult(200));
        if (ruleCode === 'WITHHOLDING_COMP_BRACKETS') return Promise.resolve(flatResult(500));
        throw new Error(`unexpected rule ${ruleCode}`);
      });

      const [payslip] = await service.computePayrollRun(COMPANY_ID, RUN_ID);

      expect(payslip.sssContribution).toBe(1350);
      expect(payslip.philhealthContribution).toBe(750);
      expect(payslip.pagibigContribution).toBe(200);
      expect(payslip.withholdingTax).toBe(500);
      expect(payslip.grossPay).toBe(30000);
      expect(payslip.totalDeductions).toBe(1350 + 750 + 200 + 500);
      expect(payslip.netPay).toBeCloseTo(30000 - (1350 + 750 + 200 + 500), 2);
      expect((payslip.computationSnapshot as { errors: string[] }).errors).toEqual([]);
    });

    it('never defaults a missing statutory number to a silent zero — it records an explicit error instead', async () => {
      const employeeMissingSss = { ...baseEmployee, sssNumber: null };
      prisma.employee.findMany.mockResolvedValue([employeeMissingSss]);
      taxEngine.computeGraduatedAmount.mockResolvedValue(flatResult(750));

      const [payslip] = await service.computePayrollRun(COMPANY_ID, RUN_ID);

      expect(payslip.sssContribution).toBe(0);
      expect((payslip.computationSnapshot as { errors: string[] }).errors).toContain('missing_sss_number');
      // Other contributions still compute independently of the SSS gap.
      expect(payslip.philhealthContribution).toBe(750);
    });

    it('records an error (not a silent zero) when a required tax rule is not configured', async () => {
      prisma.employee.findMany.mockResolvedValue([baseEmployee]);
      taxEngine.computeGraduatedAmount.mockImplementation((ruleCode: string) => {
        if (ruleCode === 'SSS_EMPLOYEE_CONTRIBUTION_RATE') return Promise.resolve(missingRule(ruleCode));
        return Promise.resolve(flatResult(100));
      });

      const [payslip] = await service.computePayrollRun(COMPANY_ID, RUN_ID);

      expect(payslip.sssContribution).toBe(0);
      expect((payslip.computationSnapshot as { errors: string[] }).errors).toContain(
        'tax_rule_not_configured:SSS_EMPLOYEE_CONTRIBUTION_RATE',
      );
    });
  });

  describe('finalizePayrollRun', () => {
    it('throws NotFoundException for a run in another company', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({ id: RUN_ID, companyId: 'other', payslips: [] });
      await expect(service.finalizePayrollRun(COMPANY_ID, RUN_ID)).rejects.toBeInstanceOf(NotFoundException);
    });

    it('refuses to finalize while any payslip has unresolved computation errors', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        id: RUN_ID,
        companyId: COMPANY_ID,
        payslips: [
          { employeeId: 'e1', computationSnapshot: { errors: ['missing_sss_number'] } },
          { employeeId: 'e2', computationSnapshot: { errors: [] } },
        ],
      });

      await expect(service.finalizePayrollRun(COMPANY_ID, RUN_ID)).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.payrollRun.update).not.toHaveBeenCalled();
    });

    it('finalizes and publishes payroll.finalized when every payslip is clean', async () => {
      prisma.payrollRun.findUnique.mockResolvedValue({
        id: RUN_ID,
        companyId: COMPANY_ID,
        payslips: [{ employeeId: 'e1', computationSnapshot: { errors: [] } }],
      });
      prisma.payrollRun.update.mockResolvedValue({ id: RUN_ID, companyId: COMPANY_ID, status: 'finalized' });

      const result = await service.finalizePayrollRun(COMPANY_ID, RUN_ID);

      expect(prisma.payrollRun.update).toHaveBeenCalledWith({
        where: { id: RUN_ID },
        data: expect.objectContaining({ status: 'finalized' }),
      });
      expect(rabbitMq.publish).toHaveBeenCalledWith('payroll.finalized', {
        payrollRunId: RUN_ID,
        companyId: COMPANY_ID,
      });
      expect(result.status).toBe('finalized');
    });
  });
});
