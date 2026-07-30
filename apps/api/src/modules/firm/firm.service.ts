import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';
import { FirmInsightsService } from './firm-insights.service';
import { CreateCompanyDto } from '../org/dto/company.dto';
import {
  AssignStaffPermissionsDto,
  CreateFirmDto,
  InviteClientCompanyDto,
  InviteFirmStaffDto,
  UpdateFirmDto,
  UpdateFirmStaffRoleDto,
} from './dto/firm.dto';

// Firm roles that imply "sees every client, not just assigned ones" and
// "can manage firm-level staff/client structure" — kept in one place since
// several methods need the same scoping decision.
const FIRM_MANAGER_PERMISSION = 'firm:clients:manage';

@Injectable()
export class FirmService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly rabbitMq: RabbitMqService,
    private readonly insights: FirmInsightsService,
  ) {}

  // ------------------------------------------------------------------
  // Firm CRUD
  // ------------------------------------------------------------------

  async createFirm(ownerId: string, dto: CreateFirmDto) {
    const ownerRole = await this.prisma.firmRole.findUniqueOrThrow({ where: { code: 'firm_owner' } });

    return this.prisma.firm.create({
      data: {
        firmName: dto.firmName,
        firmType: dto.firmType,
        contactEmail: dto.contactEmail,
        contactNumber: dto.contactNumber,
        memberships: {
          create: {
            userId: ownerId,
            firmRoleId: ownerRole.id,
            status: 'active',
            acceptedAt: new Date(),
          },
        },
      },
    });
  }

  async listMyFirms(userId: string) {
    const memberships = await this.prisma.firmMembership.findMany({
      where: { userId, status: 'active' },
      include: { firm: true, firmRole: { select: { code: true, name: true } } },
    });
    return memberships.map((m) => ({ firm: m.firm, firmRole: m.firmRole.code }));
  }

  async getFirm(firmId: string) {
    const firm = await this.prisma.firm.findUnique({ where: { id: firmId } });
    if (!firm) {
      throw new NotFoundException({ code: 'FIRM_NOT_FOUND', message: 'Firm not found.' });
    }
    return firm;
  }

  async updateFirm(firmId: string, dto: UpdateFirmDto) {
    await this.getFirm(firmId);
    return this.prisma.firm.update({
      where: { id: firmId },
      data: {
        firmName: dto.firmName,
        contactEmail: dto.contactEmail,
        contactNumber: dto.contactNumber,
      },
    });
  }

  // ------------------------------------------------------------------
  // Firm staff — invited once to the firm, never per client company
  // ------------------------------------------------------------------

  async inviteFirmStaff(firmId: string, inviterId: string, dto: InviteFirmStaffDto) {
    const invitee = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!invitee) {
      throw new NotFoundException({
        code: 'INVITEE_NOT_REGISTERED',
        message: 'No PinoyTax AI account exists for this email yet. Ask them to register first, then resend the invitation.',
      });
    }

    const firmRole = await this.prisma.firmRole.findUniqueOrThrow({ where: { code: dto.firmRoleCode } });

    const existing = await this.prisma.firmMembership.findUnique({
      where: { userId_firmId: { userId: invitee.id, firmId } },
    });
    if (existing?.status === 'active') {
      throw new ConflictException({
        code: 'ALREADY_FIRM_MEMBER',
        message: 'This user is already an active member of this firm.',
      });
    }

    if (existing) {
      // Re-inviting someone previously revoked (or re-sending a pending
      // invite with a different role) updates the single row rather than
      // erroring — [userId, firmId] is unique by design (invited once).
      return this.prisma.firmMembership.update({
        where: { id: existing.id },
        data: {
          firmRoleId: firmRole.id,
          invitedById: inviterId,
          status: 'pending',
          invitedAt: new Date(),
          acceptedAt: null,
        },
      });
    }

    return this.prisma.firmMembership.create({
      data: {
        firmId,
        userId: invitee.id,
        firmRoleId: firmRole.id,
        invitedById: inviterId,
        status: 'pending',
      },
    });
  }

  async listFirmStaff(firmId: string) {
    return this.prisma.firmMembership.findMany({
      where: { firmId },
      include: {
        user: { select: { id: true, email: true, firstName: true, lastName: true } },
        firmRole: { select: { id: true, code: true, name: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async updateFirmStaffRole(firmId: string, membershipId: string, dto: UpdateFirmStaffRoleDto) {
    const membership = await this.getFirmMembershipOrThrow(firmId, membershipId);
    await this.assertNotLastOwner(firmId, membership, 'change the role of');

    const firmRole = await this.prisma.firmRole.findUniqueOrThrow({ where: { code: dto.firmRoleCode } });
    return this.prisma.firmMembership.update({
      where: { id: membershipId },
      data: { firmRoleId: firmRole.id },
    });
  }

  async revokeFirmStaff(firmId: string, membershipId: string) {
    const membership = await this.getFirmMembershipOrThrow(firmId, membershipId);
    await this.assertNotLastOwner(firmId, membership, 'revoke');

    return this.prisma.$transaction(async (tx) => {
      await tx.firmCompanyAssignment.updateMany({
        where: { firmMembershipId: membershipId, status: 'active' },
        data: { status: 'revoked' },
      });
      return tx.firmMembership.update({
        where: { id: membershipId },
        data: { status: 'revoked' },
      });
    });
  }

  async listMyFirmInvitations(userId: string) {
    return this.prisma.firmMembership.findMany({
      where: { userId, status: 'pending' },
      include: {
        firm: { select: { id: true, firmName: true, firmType: true } },
        firmRole: { select: { code: true, name: true } },
        invitedBy: { select: { firstName: true, lastName: true, email: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async acceptFirmInvitation(userId: string, membershipId: string) {
    const invitation = await this.prisma.firmMembership.findFirst({
      where: { id: membershipId, userId, status: 'pending' },
    });
    if (!invitation) {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'No pending invitation found.' });
    }
    return this.prisma.firmMembership.update({
      where: { id: invitation.id },
      data: { status: 'active', acceptedAt: new Date() },
    });
  }

  private async getFirmMembershipOrThrow(firmId: string, membershipId: string) {
    const membership = await this.prisma.firmMembership.findUnique({
      where: { id: membershipId },
      include: { firmRole: true },
    });
    if (!membership || membership.firmId !== firmId) {
      throw new NotFoundException({ code: 'FIRM_MEMBERSHIP_NOT_FOUND', message: 'Firm staff record not found.' });
    }
    return membership;
  }

  private async assertNotLastOwner(
    firmId: string,
    membership: { id: string; status: string; firmRole: { code: string } },
    verb: string,
  ) {
    if (membership.firmRole.code !== 'firm_owner' || membership.status !== 'active') {
      return;
    }
    const ownerRole = await this.prisma.firmRole.findUniqueOrThrow({ where: { code: 'firm_owner' } });
    const activeOwnerCount = await this.prisma.firmMembership.count({
      where: { firmId, firmRoleId: ownerRole.id, status: 'active' },
    });
    if (activeOwnerCount <= 1) {
      throw new BadRequestException({
        code: 'CANNOT_REMOVE_LAST_OWNER',
        message: `Cannot ${verb} the firm's only active owner.`,
      });
    }
  }

  // ------------------------------------------------------------------
  // Client companies
  // ------------------------------------------------------------------

  async createClientCompany(firmId: string, actorId: string, dto: CreateCompanyDto) {
    await this.getFirm(firmId);

    const existingTin = await this.prisma.company.findUnique({ where: { tin: dto.tin } });
    if (existingTin) {
      throw new ConflictException({
        code: 'TIN_ALREADY_REGISTERED',
        message: 'A company with this TIN is already registered on the platform.',
      });
    }

    const membership = await this.prisma.firmMembership.findUniqueOrThrow({
      where: { userId_firmId: { userId: actorId, firmId } },
    });

    const allPermissions = await this.prisma.permission.findMany({ select: { id: true } });

    const company = await this.prisma.$transaction(async (tx) => {
      const created = await tx.company.create({
        data: {
          firmId,
          businessName: dto.businessName,
          tradeName: dto.tradeName,
          businessType: dto.businessType,
          vatClassification: dto.vatClassification,
          tin: dto.tin,
          rdoCode: dto.rdoCode,
          businessAddress: dto.businessAddress,
          email: dto.email,
          contactNumber: dto.contactNumber,
        },
      });

      // The firm staffer who onboarded this client gets full access to it
      // immediately, so the client isn't left inaccessible to anyone —
      // other staff are assigned explicitly afterward (firm:clients:assign).
      await tx.firmCompanyAssignment.create({
        data: {
          firmMembershipId: membership.id,
          companyId: created.id,
          assignedById: actorId,
          status: 'active',
          permissions: { create: allPermissions.map((p) => ({ permissionId: p.id })) },
        },
      });

      return created;
    });

    this.eventEmitter.emit('company.created', { companyId: company.id });
    await this.rabbitMq.publish('company.created', { companyId: company.id, tin: company.tin });

    return company;
  }

  /** Scope-aware: managers (firm:clients:manage) see every client; other staff see only companies they're actively assigned to. */
  async listClientCompanies(firmId: string, requestingUserId: string) {
    const canSeeAll = await this.hasFirmPermission(firmId, requestingUserId, FIRM_MANAGER_PERMISSION);

    if (canSeeAll) {
      return this.prisma.company.findMany({ where: { firmId }, orderBy: { businessName: 'asc' } });
    }

    const membership = await this.prisma.firmMembership.findFirst({
      where: { firmId, userId: requestingUserId, status: 'active' },
    });
    if (!membership) return [];

    const assignments = await this.prisma.firmCompanyAssignment.findMany({
      where: { firmMembershipId: membership.id, status: 'active' },
      include: { company: true },
    });
    return assignments.map((a) => a.company).sort((a, b) => a.businessName.localeCompare(b.businessName));
  }

  async lookupCompanyByTin(tin: string) {
    const company = await this.prisma.company.findUnique({
      where: { tin },
      select: { id: true, businessName: true, tradeName: true, firmId: true },
    });
    if (!company) {
      throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: 'No company is registered with this TIN.' });
    }
    return company;
  }

  async inviteClientCompany(firmId: string, inviterId: string, dto: InviteClientCompanyDto) {
    await this.getFirm(firmId);

    const company = await this.prisma.company.findUnique({ where: { id: dto.companyId } });
    if (!company) {
      throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }
    if (company.firmId) {
      throw new ConflictException({
        code: 'COMPANY_ALREADY_HAS_FIRM',
        message: 'This company is already managed by a firm.',
      });
    }

    const existingPending = await this.prisma.firmClientInvitation.findFirst({
      where: { firmId, companyId: dto.companyId, status: 'pending' },
    });
    if (existingPending) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_EXISTS',
        message: 'A pending invitation already exists for this company.',
      });
    }

    return this.prisma.firmClientInvitation.create({
      data: { firmId, companyId: dto.companyId, invitedById: inviterId },
    });
  }

  /** Pending firm-engagement requests addressed to companies this user owns. */
  async listIncomingClientInvitations(userId: string) {
    return this.prisma.firmClientInvitation.findMany({
      where: {
        status: 'pending',
        company: { userRoles: { some: { userId, status: 'active', role: { code: 'business_owner' } } } },
      },
      include: {
        firm: { select: { id: true, firmName: true, firmType: true, contactEmail: true } },
        company: { select: { id: true, businessName: true } },
      },
      orderBy: { invitedAt: 'desc' },
    });
  }

  async respondToClientInvitation(userId: string, invitationId: string, accept: boolean) {
    const invitation = await this.prisma.firmClientInvitation.findUnique({ where: { id: invitationId } });
    if (!invitation || invitation.status !== 'pending') {
      throw new NotFoundException({ code: 'INVITATION_NOT_FOUND', message: 'No pending invitation found.' });
    }

    const ownerRole = await this.prisma.userCompanyRole.findFirst({
      where: {
        userId,
        companyId: invitation.companyId,
        status: 'active',
        role: { code: 'business_owner' },
      },
    });
    if (!ownerRole) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: "Only this company's owner can respond to a firm engagement request.",
      });
    }

    if (!accept) {
      return this.prisma.firmClientInvitation.update({
        where: { id: invitationId },
        data: { status: 'declined', respondedAt: new Date() },
      });
    }

    const [, updated] = await this.prisma.$transaction([
      this.prisma.company.update({ where: { id: invitation.companyId }, data: { firmId: invitation.firmId } }),
      this.prisma.firmClientInvitation.update({
        where: { id: invitationId },
        data: { status: 'accepted', respondedAt: new Date() },
      }),
    ]);
    return updated;
  }

  async removeClientCompany(firmId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.firmId !== firmId) {
      throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: 'Client company not found under this firm.' });
    }

    return this.prisma.$transaction(async (tx) => {
      await tx.firmCompanyAssignment.updateMany({
        where: { companyId, status: 'active', firmMembership: { firmId } },
        data: { status: 'revoked' },
      });
      return tx.company.update({ where: { id: companyId }, data: { firmId: null } });
    });
  }

  // ------------------------------------------------------------------
  // Staff-to-client assignments
  // ------------------------------------------------------------------

  async getPermissionCatalog() {
    return this.prisma.permission.findMany({ orderBy: { code: 'asc' } });
  }

  async listCompanyAssignments(firmId: string, companyId: string) {
    await this.assertCompanyBelongsToFirm(firmId, companyId);
    return this.prisma.firmCompanyAssignment.findMany({
      where: { companyId, firmMembership: { firmId } },
      include: {
        firmMembership: {
          include: {
            user: { select: { id: true, email: true, firstName: true, lastName: true } },
            firmRole: { select: { code: true, name: true } },
          },
        },
        permissions: { include: { permission: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  }

  async assignStaffToCompany(
    firmId: string,
    actorId: string,
    companyId: string,
    membershipId: string,
    dto: AssignStaffPermissionsDto,
  ) {
    await this.assertCompanyBelongsToFirm(firmId, companyId);
    const membership = await this.prisma.firmMembership.findUnique({ where: { id: membershipId } });
    if (!membership || membership.firmId !== firmId || membership.status !== 'active') {
      throw new NotFoundException({
        code: 'FIRM_MEMBERSHIP_NOT_FOUND',
        message: 'Active firm staff record not found.',
      });
    }

    const permissions = await this.prisma.permission.findMany({
      where: { code: { in: dto.permissionCodes } },
    });
    if (permissions.length !== dto.permissionCodes.length) {
      throw new BadRequestException({ code: 'INVALID_PERMISSION_CODE', message: 'One or more permission codes are invalid.' });
    }

    return this.prisma.$transaction(async (tx) => {
      const assignment = await tx.firmCompanyAssignment.upsert({
        where: { firmMembershipId_companyId: { firmMembershipId: membershipId, companyId } },
        create: { firmMembershipId: membershipId, companyId, assignedById: actorId, status: 'active' },
        update: { status: 'active', assignedById: actorId },
      });
      await tx.firmCompanyAssignmentPermission.deleteMany({ where: { assignmentId: assignment.id } });
      await tx.firmCompanyAssignmentPermission.createMany({
        data: permissions.map((p) => ({ assignmentId: assignment.id, permissionId: p.id })),
      });
      return tx.firmCompanyAssignment.findUniqueOrThrow({
        where: { id: assignment.id },
        include: { permissions: { include: { permission: true } } },
      });
    });
  }

  async revokeAssignment(firmId: string, assignmentId: string) {
    const assignment = await this.prisma.firmCompanyAssignment.findUnique({
      where: { id: assignmentId },
      include: { firmMembership: true },
    });
    if (!assignment || assignment.firmMembership.firmId !== firmId) {
      throw new NotFoundException({ code: 'ASSIGNMENT_NOT_FOUND', message: 'Assignment not found.' });
    }
    return this.prisma.firmCompanyAssignment.update({
      where: { id: assignmentId },
      data: { status: 'revoked' },
    });
  }

  private async assertCompanyBelongsToFirm(firmId: string, companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company || company.firmId !== firmId) {
      throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: 'Client company not found under this firm.' });
    }
  }

  private async hasFirmPermission(firmId: string, userId: string, permissionCode: string): Promise<boolean> {
    const membership = await this.prisma.firmMembership.findFirst({
      where: { firmId, userId, status: 'active' },
      include: { firmRole: { include: { permissions: { include: { firmPermission: true } } } } },
    });
    if (!membership) return false;
    return membership.firmRole.permissions.some((rp) => rp.firmPermission.code === permissionCode);
  }

  // ------------------------------------------------------------------
  // Firm dashboard
  // ------------------------------------------------------------------

  async getFirmDashboard(firmId: string, requestingUserId: string) {
    const firm = await this.getFirm(firmId);
    const companies = await this.listClientCompanies(firmId, requestingUserId);
    const companyIds = companies.map((c) => c.id);

    if (companyIds.length === 0) {
      const insight = await this.insights.generatePortfolioInsight({
        totalClients: 0,
        avgCompliancePercentage: 0,
        totalOverdueFilings: 0,
        totalOpenCriticalIssues: 0,
        totalOpenHighIssues: 0,
        clientsNeedingAttention: [],
      });
      return {
        firm,
        clients: [],
        totals: {
          totalClients: 0,
          avgCompliancePercentage: 0,
          totalOverdueFilings: 0,
          totalOpenCriticalIssues: 0,
          totalOpenHighIssues: 0,
        },
        upcomingDeadlines: [],
        aiInsight: insight,
      };
    }

    const [complianceRows, openIssues, deadlines, latestPayrollRuns, latestTaxComputations] = await Promise.all([
      this.prisma.complianceStatus.findMany({ where: { companyId: { in: companyIds } } }),
      this.prisma.flaggedIssue.findMany({ where: { companyId: { in: companyIds }, status: 'open' } }),
      this.prisma.filingDeadline.findMany({
        where: { companyId: { in: companyIds }, status: { in: ['upcoming', 'due_today', 'overdue'] } },
        orderBy: { dueDate: 'asc' },
      }),
      this.prisma.payrollRun.findMany({
        where: { companyId: { in: companyIds } },
        distinct: ['companyId'],
        orderBy: [{ companyId: 'asc' }, { createdAt: 'desc' }],
      }),
      this.prisma.taxComputation.findMany({
        where: { companyId: { in: companyIds } },
        distinct: ['companyId'],
        orderBy: [{ companyId: 'asc' }, { createdAt: 'desc' }],
      }),
    ]);

    const complianceByCompany = groupBy(complianceRows, (r) => r.companyId);
    const issuesByCompany = groupBy(openIssues, (r) => r.companyId);
    const deadlinesByCompany = groupBy(deadlines, (r) => r.companyId);
    const payrollByCompany = new Map(latestPayrollRuns.map((r) => [r.companyId, r]));
    const taxByCompany = new Map(latestTaxComputations.map((r) => [r.companyId, r]));

    const clients = companies.map((company) => {
      const compliance = complianceByCompany.get(company.id) ?? [];
      const avgCompliance = compliance.length
        ? compliance.reduce((sum, r) => sum + Number(r.compliancePercentage), 0) / compliance.length
        : 0;
      const overdueFilings = compliance.reduce((sum, r) => sum + r.overdueCount, 0);
      const issues = issuesByCompany.get(company.id) ?? [];
      const bySeverity = {
        critical: issues.filter((i) => i.severity === 'critical').length,
        high: issues.filter((i) => i.severity === 'high').length,
        medium: issues.filter((i) => i.severity === 'medium').length,
        low: issues.filter((i) => i.severity === 'low').length,
      };
      const companyDeadlines = deadlinesByCompany.get(company.id) ?? [];

      return {
        id: company.id,
        businessName: company.businessName,
        tradeName: company.tradeName,
        vatClassification: company.vatClassification,
        status: company.status,
        compliancePercentage: Math.round(avgCompliance * 100) / 100,
        overdueFilings,
        upcomingDeadlines: companyDeadlines.filter((d) => d.status !== 'overdue').length,
        openIssuesBySeverity: bySeverity,
        latestPayrollRun: toPayrollSummary(payrollByCompany.get(company.id)),
        latestTaxComputation: toTaxSummary(taxByCompany.get(company.id)),
      };
    });

    const totals = {
      totalClients: clients.length,
      avgCompliancePercentage:
        clients.length > 0
          ? Math.round((clients.reduce((sum, c) => sum + c.compliancePercentage, 0) / clients.length) * 100) / 100
          : 0,
      totalOverdueFilings: clients.reduce((sum, c) => sum + c.overdueFilings, 0),
      totalOpenCriticalIssues: clients.reduce((sum, c) => sum + c.openIssuesBySeverity.critical, 0),
      totalOpenHighIssues: clients.reduce((sum, c) => sum + c.openIssuesBySeverity.high, 0),
    };

    const clientsNeedingAttention = clients
      .filter((c) => c.overdueFilings > 0 || c.openIssuesBySeverity.critical > 0)
      .sort((a, b) => b.openIssuesBySeverity.critical - a.openIssuesBySeverity.critical || b.overdueFilings - a.overdueFilings)
      .slice(0, 10)
      .map((c) => ({
        businessName: c.businessName,
        compliancePercentage: c.compliancePercentage,
        overdueFilings: c.overdueFilings,
        openCriticalIssues: c.openIssuesBySeverity.critical,
      }));

    const insight = await this.insights.generatePortfolioInsight({
      ...totals,
      clientsNeedingAttention,
    });

    const companyNameById = new Map(companies.map((c) => [c.id, c.businessName]));
    const upcomingDeadlines = deadlines.slice(0, 15).map((d) => ({
      id: d.id,
      companyId: d.companyId,
      companyName: companyNameById.get(d.companyId) ?? '',
      formCode: d.formCode,
      agency: d.agency,
      dueDate: d.dueDate,
      status: d.status,
    }));

    return { firm, clients, totals, upcomingDeadlines, aiInsight: insight };
  }
}

function groupBy<T, K>(items: T[], keyFn: (item: T) => K): Map<K, T[]> {
  const map = new Map<K, T[]>();
  for (const item of items) {
    const key = keyFn(item);
    const list = map.get(key);
    if (list) list.push(item);
    else map.set(key, [item]);
  }
  return map;
}

function toPayrollSummary(run: { status: string; periodStart: Date; periodEnd: Date } | undefined) {
  if (!run) return null;
  return { status: run.status, periodStart: run.periodStart, periodEnd: run.periodEnd };
}

function toTaxSummary(
  computation: { computationType: string; status: string; periodEnd: Date } | undefined,
) {
  if (!computation) return null;
  return { computationType: computation.computationType, status: computation.status, periodEnd: computation.periodEnd };
}
