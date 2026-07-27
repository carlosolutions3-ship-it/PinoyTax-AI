import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { PayrollService } from './payroll.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { CreateEmployeeDto, CreatePayrollRunDto } from './dto/payroll.dto';
import { Audit } from '../audit/audit.decorator';

@ApiTags('payroll')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId')
@UseGuards(PermissionsGuard)
export class PayrollController {
  constructor(private readonly payrollService: PayrollService) {}

  @Post('employees')
  @RequirePermissions('payroll:write')
  async createEmployee(@Param('companyId') companyId: string, @Body() dto: CreateEmployeeDto) {
    return this.payrollService.createEmployee(companyId, dto);
  }

  @Get('employees')
  @RequirePermissions('payroll:read')
  async listEmployees(@Param('companyId') companyId: string) {
    return this.payrollService.listEmployees(companyId);
  }

  @Post('payroll-runs')
  @RequirePermissions('payroll:write')
  async createPayrollRun(
    @Param('companyId') companyId: string,
    @Body() dto: CreatePayrollRunDto,
    @CurrentUser() user: AuthenticatedUser,
  ) {
    return this.payrollService.createPayrollRun(companyId, dto, user.id);
  }

  @Get('payroll-runs')
  @RequirePermissions('payroll:read')
  async listPayrollRuns(@Param('companyId') companyId: string) {
    return this.payrollService.listPayrollRuns(companyId);
  }

  @Get('payroll-runs/:runId')
  @RequirePermissions('payroll:read')
  async getPayrollRun(@Param('companyId') companyId: string, @Param('runId') runId: string) {
    return this.payrollService.getPayrollRun(companyId, runId);
  }

  @Post('payroll-runs/:runId/compute')
  @RequirePermissions('payroll:write')
  async computePayrollRun(@Param('companyId') companyId: string, @Param('runId') runId: string) {
    return this.payrollService.computePayrollRun(companyId, runId);
  }

  @Post('payroll-runs/:runId/finalize')
  @RequirePermissions('payroll:finalize')
  @Audit({ action: 'payroll.finalize', entityType: 'payroll_run' })
  async finalizePayrollRun(@Param('companyId') companyId: string, @Param('runId') runId: string) {
    return this.payrollService.finalizePayrollRun(companyId, runId);
  }
}
