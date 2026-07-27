import {
  Body,
  Controller,
  Get,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { ComplianceService } from './compliance.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { UpdateIssueStatusDto } from './dto/update-issue-status.dto';

@ApiTags('compliance')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId')
@UseGuards(PermissionsGuard)
export class ComplianceController {
  constructor(private readonly complianceService: ComplianceService) {}

  @Get('deadlines')
  @RequirePermissions('compliance:read')
  async getDeadlines(
    @Param('companyId') companyId: string,
    @Query('status') status?: string,
  ) {
    return this.complianceService.getDeadlines(companyId, status);
  }

  @Get('compliance-status')
  @RequirePermissions('compliance:read')
  async getComplianceStatus(@Param('companyId') companyId: string) {
    return this.complianceService.getComplianceStatus(companyId);
  }

  @Get('flagged-issues')
  @RequirePermissions('compliance:read')
  async getFlaggedIssues(@Param('companyId') companyId: string) {
    return this.complianceService.getFlaggedIssues(companyId);
  }

  @Post('compliance-scan')
  @RequirePermissions('compliance:read')
  async runScan(@Param('companyId') companyId: string) {
    await this.complianceService.runComplianceScan(companyId);
    return { message: 'Compliance scan completed.' };
  }

  @Patch('flagged-issues/:issueId')
  @RequirePermissions('compliance:write')
  async updateIssueStatus(
    @Param('companyId') companyId: string,
    @Param('issueId') issueId: string,
    @Body() dto: UpdateIssueStatusDto,
  ) {
    return this.complianceService.updateIssueStatus(companyId, issueId, dto.status);
  }
}
