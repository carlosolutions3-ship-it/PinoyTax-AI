import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Put,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { FirmService } from './firm.service';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import { RequireFirmPermissions } from '../../common/decorators/require-firm-permissions.decorator';
import { FirmPermissionsGuard } from '../identity/guards/firm-permissions.guard';
import { Audit } from '../audit/audit.decorator';
import { CreateCompanyDto } from '../org/dto/company.dto';
import {
  AssignStaffPermissionsDto,
  CreateFirmDto,
  InviteClientCompanyDto,
  InviteFirmStaffDto,
  RespondToClientInvitationDto,
  UpdateFirmDto,
  UpdateFirmStaffRoleDto,
} from './dto/firm.dto';

@ApiTags('firms')
@ApiBearerAuth('access-token')
@Controller('firms')
export class FirmController {
  constructor(private readonly firmService: FirmService) {}

  @Post()
  async createFirm(@CurrentUser() user: AuthenticatedUser, @Body() dto: CreateFirmDto) {
    return this.firmService.createFirm(user.id, dto);
  }

  @Get()
  async listMyFirms(@CurrentUser() user: AuthenticatedUser) {
    return this.firmService.listMyFirms(user.id);
  }

  @Get('permission-catalog')
  async getPermissionCatalog() {
    return this.firmService.getPermissionCatalog();
  }

  @Get('invitations/mine')
  async listMyFirmInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.firmService.listMyFirmInvitations(user.id);
  }

  @Post('invitations/:membershipId/accept')
  async acceptFirmInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('membershipId') membershipId: string,
  ) {
    return this.firmService.acceptFirmInvitation(user.id, membershipId);
  }

  @Get('client-invitations/mine')
  async listIncomingClientInvitations(@CurrentUser() user: AuthenticatedUser) {
    return this.firmService.listIncomingClientInvitations(user.id);
  }

  @Post('client-invitations/:invitationId/respond')
  async respondToClientInvitation(
    @CurrentUser() user: AuthenticatedUser,
    @Param('invitationId') invitationId: string,
    @Body() dto: RespondToClientInvitationDto,
  ) {
    return this.firmService.respondToClientInvitation(user.id, invitationId, dto.accept);
  }

  @Get(':firmId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:dashboard:view')
  async getFirm(@Param('firmId') firmId: string) {
    return this.firmService.getFirm(firmId);
  }

  @Patch(':firmId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:manage')
  @Audit({ action: 'firm.update', entityType: 'firm' })
  async updateFirm(@Param('firmId') firmId: string, @Body() dto: UpdateFirmDto) {
    return this.firmService.updateFirm(firmId, dto);
  }

  @Get(':firmId/dashboard')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:dashboard:view')
  async getFirmDashboard(@Param('firmId') firmId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.firmService.getFirmDashboard(firmId, user.id);
  }

  @Post(':firmId/staff')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:staff:invite')
  async inviteFirmStaff(
    @Param('firmId') firmId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteFirmStaffDto,
  ) {
    return this.firmService.inviteFirmStaff(firmId, user.id, dto);
  }

  @Get(':firmId/staff')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:staff:invite')
  async listFirmStaff(@Param('firmId') firmId: string) {
    return this.firmService.listFirmStaff(firmId);
  }

  @Patch(':firmId/staff/:membershipId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:staff:manage_roles')
  @Audit({ action: 'firm_staff.role_change', entityType: 'firm_membership' })
  async updateFirmStaffRole(
    @Param('firmId') firmId: string,
    @Param('membershipId') membershipId: string,
    @Body() dto: UpdateFirmStaffRoleDto,
  ) {
    return this.firmService.updateFirmStaffRole(firmId, membershipId, dto);
  }

  @Delete(':firmId/staff/:membershipId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:staff:invite')
  @Audit({ action: 'firm_staff.revoke', entityType: 'firm_membership' })
  async revokeFirmStaff(@Param('firmId') firmId: string, @Param('membershipId') membershipId: string) {
    return this.firmService.revokeFirmStaff(firmId, membershipId);
  }

  @Post(':firmId/companies')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:manage')
  @Audit({ action: 'firm_client.create', entityType: 'company' })
  async createClientCompany(
    @Param('firmId') firmId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: CreateCompanyDto,
  ) {
    return this.firmService.createClientCompany(firmId, user.id, dto);
  }

  @Get(':firmId/companies')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:dashboard:view')
  async listClientCompanies(@Param('firmId') firmId: string, @CurrentUser() user: AuthenticatedUser) {
    return this.firmService.listClientCompanies(firmId, user.id);
  }

  @Get(':firmId/companies/lookup')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:manage')
  async lookupCompanyByTin(@Param('firmId') _firmId: string, @Query('tin') tin: string) {
    return this.firmService.lookupCompanyByTin(tin);
  }

  @Delete(':firmId/companies/:companyId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:manage')
  @Audit({ action: 'firm_client.remove', entityType: 'company' })
  async removeClientCompany(@Param('firmId') firmId: string, @Param('companyId') companyId: string) {
    return this.firmService.removeClientCompany(firmId, companyId);
  }

  @Post(':firmId/client-invitations')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:manage')
  async inviteClientCompany(
    @Param('firmId') firmId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: InviteClientCompanyDto,
  ) {
    return this.firmService.inviteClientCompany(firmId, user.id, dto);
  }

  @Get(':firmId/companies/:companyId/assignments')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:assign')
  async listCompanyAssignments(@Param('firmId') firmId: string, @Param('companyId') companyId: string) {
    return this.firmService.listCompanyAssignments(firmId, companyId);
  }

  @Put(':firmId/companies/:companyId/assignments/:membershipId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:assign')
  @Audit({ action: 'firm_assignment.set', entityType: 'firm_company_assignment' })
  async assignStaffToCompany(
    @Param('firmId') firmId: string,
    @Param('companyId') companyId: string,
    @Param('membershipId') membershipId: string,
    @CurrentUser() user: AuthenticatedUser,
    @Body() dto: AssignStaffPermissionsDto,
  ) {
    return this.firmService.assignStaffToCompany(firmId, user.id, companyId, membershipId, dto);
  }

  @Delete(':firmId/assignments/:assignmentId')
  @UseGuards(FirmPermissionsGuard)
  @RequireFirmPermissions('firm:clients:assign')
  @Audit({ action: 'firm_assignment.revoke', entityType: 'firm_company_assignment' })
  async revokeAssignment(@Param('firmId') firmId: string, @Param('assignmentId') assignmentId: string) {
    return this.firmService.revokeAssignment(firmId, assignmentId);
  }
}
