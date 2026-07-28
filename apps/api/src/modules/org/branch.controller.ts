import { Body, Controller, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { BranchService } from './branch.service';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { CreateBranchDto, UpdateBranchDto } from './dto/branch.dto';
import { Audit } from '../audit/audit.decorator';

// Branches are part of a company's own configuration (locations/RDO
// registrations), so they're gated by the same company:read/company:write
// permissions as the company profile itself, not a separate permission
// code — matches OrgController's updateCompany gating.
@ApiTags('branches')
@ApiBearerAuth('access-token')
@Controller('companies/:companyId/branches')
@UseGuards(PermissionsGuard)
export class BranchController {
  constructor(private readonly branchService: BranchService) {}

  @Post()
  @RequirePermissions('company:write')
  @Audit({ action: 'branch.create', entityType: 'branch' })
  async create(@Param('companyId') companyId: string, @Body() dto: CreateBranchDto) {
    return this.branchService.createBranch(companyId, dto);
  }

  @Get()
  @RequirePermissions('company:read')
  async list(@Param('companyId') companyId: string) {
    return this.branchService.listBranches(companyId);
  }

  @Get(':branchId')
  @RequirePermissions('company:read')
  async getOne(@Param('companyId') companyId: string, @Param('branchId') branchId: string) {
    return this.branchService.getBranch(companyId, branchId);
  }

  @Patch(':branchId')
  @RequirePermissions('company:write')
  @Audit({ action: 'branch.update', entityType: 'branch' })
  async update(
    @Param('companyId') companyId: string,
    @Param('branchId') branchId: string,
    @Body() dto: UpdateBranchDto,
  ) {
    return this.branchService.updateBranch(companyId, branchId, dto);
  }
}
