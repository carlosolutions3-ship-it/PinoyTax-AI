import {
  BadRequestException,
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TaxEngineService } from '../tax-engine/tax-engine.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';
import { CreateEmployeeDto, CreatePayrollRunDto } from './dto/payroll.dto';

@Injectable()
export class PayrollService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly taxEngine: TaxEngineService,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  async createEmployee(companyId: string, dto: CreateEmployeeDto) {
    return this.prisma.employee.create({
      data: {
        companyId,
        firstName: dto.firstName,
        lastName: dto.lastName,
        tin: dto.tin,
        sssNumber: dto.sssNumber,
        philhealthNumber: dto.philhealthNumber,
        pagibigNumber: dto.pagibigNumber,
        dateHired: new Date(dto.dateHired),
        basicSalary: dto.basicSalary,
        payFrequency: dto.payFrequency,
      },
    });
  }

  async listEmployees(companyId: string) {
    return this.prisma.employee.findMany({ where: { companyId, employmentStatus: 'active' } });
  }

  async listPayrollRuns(companyId: string) {
    return this.prisma.payrollRun.findMany({
      where: { companyId },
      orderBy: { periodStart: 'desc' },
    });
  }

  async getPayrollRun(companyId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: { payslips: { include: { employee: true } } },
    });
    if (!run || run.companyId !== companyId) {
      throw new NotFoundException({ code: 'PAYROLL_RUN_NOT_FOUND', message: 'Payroll run not found.' });
    }
    return run;
  }

  async createPayrollRun(companyId: string, dto: CreatePayrollRunDto, createdById: string) {
    return this.prisma.payrollRun.create({
      data: {
        companyId,
        periodStart: new Date(dto.periodStart),
        periodEnd: new Date(dto.periodEnd),
        createdById,
        status: 'draft',
      },
    });
  }

  /**
   * Computes draft payslips for every active employee. Any employee missing
   * data required for a given contribution is SKIPPED for that contribution
   * with an explicit error attached to the payslip breakdown — never
   * defaulted to zero silently (Phase 3 §3.3).
   */
  async computePayrollRun(companyId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findUnique({ where: { id: payrollRunId } });
    if (!run || run.companyId !== companyId) {
      throw new NotFoundException({ code: 'PAYROLL_RUN_NOT_FOUND', message: 'Payroll run not found.' });
    }
    if (run.status === 'finalized' || run.status === 'paid') {
      throw new ConflictException({
        code: 'PAYROLL_RUN_IMMUTABLE',
        message: 'This payroll run has already been finalized and cannot be recomputed.',
      });
    }

    await this.prisma.payrollRun.update({ where: { id: run.id }, data: { status: 'processing' } });

    const employees = await this.prisma.employee.findMany({
      where: { companyId: run.companyId, employmentStatus: 'active' },
    });

    // Clear any prior draft payslips for this run before recomputing.
    await this.prisma.payslip.deleteMany({ where: { payrollRunId: run.id } });

    const results = [];
    for (const employee of employees) {
      const basicPay = Number(employee.basicSalary);
      const errors: string[] = [];

      // SSS/PhilHealth/Pag-IBIG are each seeded as a two-bracket graduated
      // rule (real rate up to the official salary ceiling, 0% beyond it) so
      // the contribution correctly caps instead of growing linearly past
      // the ceiling — see the seed.ts comments above each rule for exactly
      // what is and isn't modeled (none apply the low-income floor).
      let sssContribution = 0;
      if (!employee.sssNumber) {
        errors.push('missing_sss_number');
      } else {
        const sss = await this.taxEngine.computeGraduatedAmount(
          'SSS_EMPLOYEE_CONTRIBUTION_RATE',
          basicPay,
          run.periodEnd,
        );
        if (sss.missingInputs.length > 0) errors.push(...sss.missingInputs);
        else sssContribution = sss.result ?? 0;
      }

      let philhealthContribution = 0;
      if (!employee.philhealthNumber) {
        errors.push('missing_philhealth_number');
      } else {
        const philhealth = await this.taxEngine.computeGraduatedAmount(
          'PHILHEALTH_EMPLOYEE_CONTRIBUTION_RATE',
          basicPay,
          run.periodEnd,
        );
        if (philhealth.missingInputs.length > 0) errors.push(...philhealth.missingInputs);
        else philhealthContribution = philhealth.result ?? 0;
      }

      let pagibigContribution = 0;
      if (!employee.pagibigNumber) {
        errors.push('missing_pagibig_number');
      } else {
        const pagibig = await this.taxEngine.computeGraduatedAmount(
          'PAGIBIG_EMPLOYEE_CONTRIBUTION_RATE',
          basicPay,
          run.periodEnd,
        );
        if (pagibig.missingInputs.length > 0) errors.push(...pagibig.missingInputs);
        else pagibigContribution = pagibig.result ?? 0;
      }

      let withholdingTax = 0;
      const withholding = await this.taxEngine.computeGraduatedAmount(
        'WITHHOLDING_COMP_BRACKETS',
        basicPay,
        run.periodEnd,
      );
      if (withholding.missingInputs.length > 0) errors.push(...withholding.missingInputs);
      else withholdingTax = withholding.result ?? 0;

      const totalDeductions = sssContribution + philhealthContribution + pagibigContribution + withholdingTax;
      const grossPay = basicPay;
      const netPay = Number((grossPay - totalDeductions).toFixed(2));

      const payslip = await this.prisma.payslip.create({
        data: {
          payrollRunId: run.id,
          employeeId: employee.id,
          basicPay,
          overtimePay: 0,
          holidayPay: 0,
          allowances: 0,
          sssContribution,
          philhealthContribution,
          pagibigContribution,
          withholdingTax,
          grossPay,
          totalDeductions,
          netPay,
          computationSnapshot: { errors, computedAt: new Date().toISOString() },
        },
      });

      results.push(payslip);
    }

    return results;
  }

  async finalizePayrollRun(companyId: string, payrollRunId: string) {
    const run = await this.prisma.payrollRun.findUnique({
      where: { id: payrollRunId },
      include: { payslips: true },
    });
    if (!run || run.companyId !== companyId) {
      throw new NotFoundException({ code: 'PAYROLL_RUN_NOT_FOUND', message: 'Payroll run not found.' });
    }

    const blockingErrors = run.payslips.filter((p) => {
      const snapshot = p.computationSnapshot as { errors?: string[] } | null;
      return snapshot?.errors && snapshot.errors.length > 0;
    });

    if (blockingErrors.length > 0) {
      throw new BadRequestException({
        code: 'PAYROLL_RUN_HAS_ERRORS',
        message:
          'Some payslips have unresolved computation errors (missing employee data or tax rules). Resolve them before finalizing.',
        details: blockingErrors.map((p) => ({
          employeeId: p.employeeId,
          errors: (p.computationSnapshot as { errors?: string[] })?.errors,
        })),
      });
    }

    return this.prisma.payrollRun.update({
      where: { id: run.id },
      data: { status: 'finalized', finalizedAt: new Date() },
    }).then(async (updated) => {
      await this.rabbitMq.publish('payroll.finalized', {
        payrollRunId: updated.id,
        companyId: updated.companyId,
      });
      return updated;
    });
  }
}
