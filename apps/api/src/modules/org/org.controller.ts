import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { OrgService } from './org.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequirePermissions } from '../../common/decorators/require-permissions.decorator';
import { PermissionsGuard } from '../identity/guards/permissions.guard';
import { CreateCompanyDto, InviteStaffDto, UpdateCompanyDto } from './dto/company.dto';
import { Audit } from '../audit/audit.decorator';

@ApiTags('companies')
@ApiBearerAuth('access-token')
@Controller('companies')
export class OrgController {
  constructor(private readonly orgService: OrgService) {}

  @Post()
  async createCompany(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateCompanyDto) {
    return this.orgService.createCompany(user.id, dto);
  }

  @Get()
  async listMyCompanies(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.listMyCompanies(user.id);
  }

  @Get(':companyId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('company:read')
  async getCompany(@Param('companyId') companyId: string) {
    return this.orgService.getCompany(companyId);
  }

  @Patch(':companyId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('company:write')
  @Audit({ action: 'company.update', entityType: 'company' })
  async updateCompany(@Param('companyId') companyId: string, @Body() dto: UpdateCompanyDto) {
    return this.orgService.updateCompany(companyId, dto);
  }

  @Post(':companyId/invitations')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('staff:invite')
  async inviteStaff(
    @Param('companyId') companyId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteStaffDto,
  ) {
    return this.orgService.inviteStaff(companyId, user.id, dto);
  }

  @Get('invitations/mine')
  async listMyInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.orgService.listMyInvitations(user.id);
  }

  @Post('invitations/:invitationId/accept')
  async acceptInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId') invitationId: string,
  ) {
    return this.orgService.acceptInvitation(user.id, invitationId);
  }

  @Get(':companyId/staff')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('staff:invite')
  async listStaff(@Param('companyId') companyId: string) {
    return this.orgService.listStaff(companyId);
  }

  @Delete(':companyId/staff/:userCompanyRoleId')
  @UseGuards(PermissionsGuard)
  @RequirePermissions('staff:invite')
  @Audit({ action: 'staff.revoke', entityType: 'user_company_role' })
  async revokeStaff(
    @Param('companyId') companyId: string,
    @Param('userCompanyRoleId') userCompanyRoleId: string,
  ) {
    return this.orgService.revokeStaff(companyId, userCompanyRoleId);
  }
}
