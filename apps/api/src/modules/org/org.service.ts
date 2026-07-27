import {
  ConflictException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';
import { CreateCompanyDto, InviteStaffDto, UpdateCompanyDto } from './dto/company.dto';

@Injectable()
export class OrgService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly eventEmitter: EventEmitter2,
    private readonly rabbitMq: RabbitMqService,
  ) {}

  async createCompany(ownerId: string, dto: CreateCompanyDto) {
    const existingTin = await this.prisma.company.findUnique({ where: { tin: dto.tin } });
    if (existingTin) {
      throw new ConflictException({
        code: 'TIN_ALREADY_REGISTERED',
        message: 'A company with this TIN is already registered on the platform.',
      });
    }

    const ownerRole = await this.prisma.role.findUniqueOrThrow({
      where: { code: 'business_owner' },
    });

    const company = await this.prisma.company.create({
      data: {
        businessName: dto.businessName,
        tradeName: dto.tradeName,
        businessType: dto.businessType,
        vatClassification: dto.vatClassification,
        tin: dto.tin,
        rdoCode: dto.rdoCode,
        businessAddress: dto.businessAddress,
        email: dto.email,
        contactNumber: dto.contactNumber,
        userRoles: {
          create: {
            userId: ownerId,
            roleId: ownerRole.id,
            status: 'active',
            acceptedAt: new Date(),
          },
        },
      },
    });

    // Compliance module seeds filing_deadlines / initial scan asynchronously
    // in response to this event (see ComplianceService.handleCompanyCreated),
    // keeping Org decoupled from Compliance's internals (Phase 3 §3.1, §4.1).
    this.eventEmitter.emit('company.created', { companyId: company.id });
    await this.rabbitMq.publish('company.created', { companyId: company.id, tin: company.tin });

    return company;
  }

  async listMyCompanies(userId: string) {
    const roles = await this.prisma.userCompanyRole.findMany({
      where: { userId, status: 'active' },
      include: { company: true, role: true },
    });
    return roles.map((r) => ({ company: r.company, role: r.role.code }));
  }

  async getCompany(companyId: string) {
    const company = await this.prisma.company.findUnique({ where: { id: companyId } });
    if (!company) {
      throw new NotFoundException({ code: 'COMPANY_NOT_FOUND', message: 'Company not found.' });
    }
    return company;
  }

  async updateCompany(companyId: string, dto: UpdateCompanyDto) {
    const existing = await this.getCompany(companyId);

    const updated = await this.prisma.company.update({
      where: { id: companyId },
      data: {
        tradeName: dto.tradeName,
        vatClassification: dto.vatClassification,
        rdoCode: dto.rdoCode,
        businessAddress: dto.businessAddress,
        email: dto.email,
        contactNumber: dto.contactNumber,
      },
    });

    // A VAT classification change affects which deadlines/compliance rules
    // apply, so re-run the compliance scan whenever it changes (Phase 3
    // §3.1's "profile changes re-trigger classification" behavior).
    if (dto.vatClassification && dto.vatClassification !== existing.vatClassification) {
      this.eventEmitter.emit('company.updated', { companyId });
      await this.rabbitMq.publish('company.updated', {
        companyId,
        vatClassification: dto.vatClassification,
      });
    }

    return updated;
  }

  async inviteStaff(companyId: string, inviterId: string, dto: InviteStaffDto) {
    const invitee = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    if (!invitee) {
      // Matches the documented workflow (Phase 3 §3.2): the invitee must
      // register an account first before they can be attached to a company.
      throw new NotFoundException({
        code: 'INVITEE_NOT_REGISTERED',
        message:
          'No PinoyTax AI account exists for this email yet. Ask them to register first, then resend the invitation.',
      });
    }

    const role = await this.prisma.role.findUniqueOrThrow({ where: { code: dto.roleCode } });

    const existing = await this.prisma.userCompanyRole.findFirst({
      where: { userId: invitee.id, companyId, roleId: role.id },
    });
    if (existing) {
      throw new ConflictException({
        code: 'INVITATION_ALREADY_EXISTS',
        message: 'This user already has a pending or active role on this company.',
      });
    }

    return this.prisma.userCompanyRole.create({
      data: {
        userId: invitee.id,
        companyId,
        roleId: role.id,
        invitedById: inviterId,
        status: 'pending',
      },
    });
  }

  async acceptInvitation(userId: string, userCompanyRoleId: string) {
    const invitation = await this.prisma.userCompanyRole.findFirst({
      where: { id: userCompanyRoleId, userId, status: 'pending' },
    });
    if (!invitation) {
      throw new NotFoundException({
        code: 'INVITATION_NOT_FOUND',
        message: 'No pending invitation found.',
      });
    }

    return this.prisma.userCompanyRole.update({
      where: { id: invitation.id },
      data: { status: 'active', acceptedAt: new Date() },
    });
  }
}
