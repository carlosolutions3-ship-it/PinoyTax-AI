import { Controller, Get, Param, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { AdminGuard } from '../identity/guards/admin.guard';

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs/:companyId')
  async listAuditLogs(@Param('companyId') companyId: string, @Query('take') take?: string) {
    return this.auditService.listForCompany(companyId, take ? Number(take) : undefined);
  }

  @Get('security-events')
  async listSecurityEvents(@Query('take') take?: string) {
    return this.auditService.listSecurityEvents(take ? Number(take) : undefined);
  }
}
