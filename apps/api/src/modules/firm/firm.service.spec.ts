import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { FirmService } from './firm.service';
import { FirmInsightsService } from './firm-insights.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { RabbitMqService } from '../../messaging/rabbitmq.service';

/**
 * FirmService is where the firm-architecture business rules actually live —
 * the guards only decide "can this request proceed at all"; this service
 * decides things like "can the LAST owner be demoted" and "does this
 * assignment's permission list only contain real permission codes", where a
 * bug is a privilege-escalation or account-lockout hole, not just a wrong
 * response. Tests below target exactly those rules rather than every method.
 */
describe('FirmService', () => {
  let service: FirmService;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let prisma: Record<string, any>;

  const FIRM_ID = 'firm-1';
  const USER_ID = 'user-1';

  beforeEach(() => {
    prisma = {
      firm: { create: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      firmRole: { findUniqueOrThrow: jest.fn() },
      firmMembership: {
        create: jest.fn(),
        update: jest.fn(),
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        count: jest.fn(),
      },
      firmCompanyAssignment: {
        create: jest.fn(),
        findMany: jest.fn(),
        findUnique: jest.fn(),
        findUniqueOrThrow: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        upsert: jest.fn(),
      },
      firmCompanyAssignmentPermission: { deleteMany: jest.fn(), createMany: jest.fn() },
      firmClientInvitation: { create: jest.fn(), findFirst: jest.fn(), findUnique: jest.fn(), update: jest.fn() },
      company: { findUnique: jest.fn(), findMany: jest.fn(), update: jest.fn(), create: jest.fn() },
      userCompanyRole: { findFirst: jest.fn() },
      permission: { findMany: jest.fn() },
      complianceStatus: { findMany: jest.fn() },
      flaggedIssue: { findMany: jest.fn() },
      filingDeadline: { findMany: jest.fn() },
      payrollRun: { findMany: jest.fn() },
      taxComputation: { findMany: jest.fn() },
      $transaction: jest.fn(),
    };
    // Interactive-transaction form runs the callback against the same mock
    // ("tx" behaves identically to the top-level client here); array form
    // resolves each promise, matching Prisma's actual $transaction semantics
    // closely enough for these unit tests.
    prisma.$transaction.mockImplementation((arg: unknown) =>
      Array.isArray(arg) ? Promise.all(arg) : (arg as (tx: unknown) => unknown)(prisma),
    );

    service = new FirmService(
      prisma as unknown as PrismaService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { publish: jest.fn() } as unknown as RabbitMqService,
      { generatePortfolioInsight: jest.fn().mockResolvedValue('insight') } as unknown as FirmInsightsService,
    );
  });

  describe('createFirm', () => {
    it('creates the firm with the creator as an active firm_owner', async () => {
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-owner', code: 'firm_owner' });
      prisma.firm.create.mockResolvedValue({ id: FIRM_ID });

      await service.createFirm(USER_ID, {
        firmName: 'Acme CPAs',
        firmType: 'accounting_firm' as never,
        contactEmail: 'a@b.com',
      });

      expect(prisma.firm.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            memberships: {
              create: expect.objectContaining({ userId: USER_ID, firmRoleId: 'role-owner', status: 'active' }),
            },
          }),
        }),
      );
    });
  });

  describe('inviteFirmStaff', () => {
    it('rejects inviting an email with no registered account', async () => {
      prisma.user = { findUnique: jest.fn().mockResolvedValue(null) };
      await expect(
        service.inviteFirmStaff(FIRM_ID, USER_ID, { email: 'nobody@example.com', firmRoleCode: 'firm_admin' }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('rejects re-inviting someone who already holds an active membership', async () => {
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ id: 'invitee-1' }) };
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-admin', code: 'firm_admin' });
      prisma.firmMembership.findUnique.mockResolvedValue({ id: 'mem-1', status: 'active' });

      await expect(
        service.inviteFirmStaff(FIRM_ID, USER_ID, { email: 'x@y.com', firmRoleCode: 'firm_admin' }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.firmMembership.create).not.toHaveBeenCalled();
    });

    it('re-activates a previously revoked membership as pending instead of creating a duplicate row (invite-once semantics)', async () => {
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ id: 'invitee-1' }) };
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-admin', code: 'firm_admin' });
      prisma.firmMembership.findUnique.mockResolvedValue({ id: 'mem-1', status: 'revoked' });
      prisma.firmMembership.update.mockResolvedValue({ id: 'mem-1', status: 'pending' });

      const result = await service.inviteFirmStaff(FIRM_ID, USER_ID, { email: 'x@y.com', firmRoleCode: 'firm_admin' });

      expect(prisma.firmMembership.create).not.toHaveBeenCalled();
      expect(prisma.firmMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: 'mem-1' },
          data: expect.objectContaining({ status: 'pending', acceptedAt: null }),
        }),
      );
      expect(result.status).toBe('pending');
    });

    it('creates a brand-new pending membership for a first-time invite', async () => {
      prisma.user = { findUnique: jest.fn().mockResolvedValue({ id: 'invitee-1' }) };
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-admin', code: 'firm_admin' });
      prisma.firmMembership.findUnique.mockResolvedValue(null);
      prisma.firmMembership.create.mockResolvedValue({ id: 'mem-2', status: 'pending' });

      await service.inviteFirmStaff(FIRM_ID, USER_ID, { email: 'x@y.com', firmRoleCode: 'firm_admin' });

      expect(prisma.firmMembership.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ firmId: FIRM_ID, userId: 'invitee-1', status: 'pending' }),
        }),
      );
    });
  });

  describe('last-owner protection', () => {
    const ownerMembership = { id: 'mem-owner', firmId: FIRM_ID, status: 'active', firmRole: { code: 'firm_owner' } };

    it('blocks revoking the firm\'s only active owner', async () => {
      prisma.firmMembership.findUnique.mockResolvedValue(ownerMembership);
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-owner', code: 'firm_owner' });
      prisma.firmMembership.count.mockResolvedValue(1);

      await expect(service.revokeFirmStaff(FIRM_ID, 'mem-owner')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.firmMembership.update).not.toHaveBeenCalled();
    });

    it('allows revoking an owner when another active owner still remains', async () => {
      prisma.firmMembership.findUnique.mockResolvedValue(ownerMembership);
      prisma.firmRole.findUniqueOrThrow.mockResolvedValue({ id: 'role-owner', code: 'firm_owner' });
      prisma.firmMembership.count.mockResolvedValue(2);
      prisma.firmCompanyAssignment.updateMany.mockResolvedValue({ count: 0 });
      prisma.firmMembership.update.mockResolvedValue({ id: 'mem-owner', status: 'revoked' });

      await service.revokeFirmStaff(FIRM_ID, 'mem-owner');
      expect(prisma.firmMembership.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'mem-owner' }, data: { status: 'revoked' } }),
      );
    });

    it('never restricts revoking a non-owner, regardless of owner count', async () => {
      prisma.firmMembership.findUnique.mockResolvedValue({
        id: 'mem-bk',
        firmId: FIRM_ID,
        status: 'active',
        firmRole: { code: 'firm_bookkeeper' },
      });
      prisma.firmCompanyAssignment.updateMany.mockResolvedValue({ count: 0 });
      prisma.firmMembership.update.mockResolvedValue({ id: 'mem-bk', status: 'revoked' });

      await service.revokeFirmStaff(FIRM_ID, 'mem-bk');
      expect(prisma.firmRole.findUniqueOrThrow).not.toHaveBeenCalled();
      expect(prisma.firmMembership.update).toHaveBeenCalled();
    });

    it('rejects operating on a membership that belongs to a different firm', async () => {
      prisma.firmMembership.findUnique.mockResolvedValue({ id: 'mem-1', firmId: 'other-firm', firmRole: { code: 'firm_admin' } });
      await expect(service.revokeFirmStaff(FIRM_ID, 'mem-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });

  describe('createClientCompany', () => {
    it('rejects a duplicate TIN', async () => {
      prisma.firm.findUnique.mockResolvedValue({ id: FIRM_ID });
      prisma.company.findUnique.mockResolvedValue({ id: 'existing-co' });

      await expect(
        service.createClientCompany(FIRM_ID, USER_ID, {
          businessName: 'Acme',
          businessType: 'sole_prop' as never,
          vatClassification: 'vat' as never,
          tin: '111-111-111',
        }),
      ).rejects.toBeInstanceOf(ConflictException);
      expect(prisma.company.create).not.toHaveBeenCalled();
    });

    it('grants the creator a full-permission assignment on the new client', async () => {
      prisma.firm.findUnique.mockResolvedValue({ id: FIRM_ID });
      prisma.company.findUnique.mockResolvedValue(null);
      prisma.firmMembership.findUniqueOrThrow.mockResolvedValue({ id: 'mem-creator' });
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1' }, { id: 'perm-2' }]);
      prisma.company.create.mockResolvedValue({ id: 'new-co', tin: '111-111-111' });
      prisma.firmCompanyAssignment.create.mockResolvedValue({ id: 'assignment-1' });

      await service.createClientCompany(FIRM_ID, USER_ID, {
        businessName: 'Acme',
        businessType: 'sole_prop' as never,
        vatClassification: 'vat' as never,
        tin: '111-111-111',
      });

      expect(prisma.firmCompanyAssignment.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            firmMembershipId: 'mem-creator',
            companyId: 'new-co',
            permissions: { create: [{ permissionId: 'perm-1' }, { permissionId: 'perm-2' }] },
          }),
        }),
      );
    });
  });

  describe('listClientCompanies — scope-aware visibility', () => {
    it('returns every client for a firm:clients:manage role', async () => {
      prisma.firmMembership.findFirst.mockResolvedValue({
        firmRole: { permissions: [{ firmPermission: { code: 'firm:clients:manage' } }] },
      });
      prisma.company.findMany.mockResolvedValue([{ id: 'co-1', businessName: 'A' }, { id: 'co-2', businessName: 'B' }]);

      const result = await service.listClientCompanies(FIRM_ID, USER_ID);

      expect(prisma.company.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { firmId: FIRM_ID } }));
      expect(result).toHaveLength(2);
    });

    it('returns only the caller\'s own assignments when they lack firm:clients:manage', async () => {
      prisma.firmMembership.findFirst
        .mockResolvedValueOnce({ firmRole: { permissions: [] } }) // hasFirmPermission check
        .mockResolvedValueOnce({ id: 'mem-1' }); // membership lookup for scoping
      prisma.firmCompanyAssignment.findMany.mockResolvedValue([
        { company: { id: 'co-1', businessName: 'Assigned Co' } },
      ]);

      const result = await service.listClientCompanies(FIRM_ID, USER_ID);

      expect(prisma.company.findMany).not.toHaveBeenCalled();
      expect(prisma.firmCompanyAssignment.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { firmMembershipId: 'mem-1', status: 'active' } }),
      );
      expect(result).toEqual([{ id: 'co-1', businessName: 'Assigned Co' }]);
    });

    it('returns an empty list for someone with no membership at all', async () => {
      prisma.firmMembership.findFirst.mockResolvedValueOnce(null).mockResolvedValueOnce(null);
      const result = await service.listClientCompanies(FIRM_ID, USER_ID);
      expect(result).toEqual([]);
    });
  });

  describe('respondToClientInvitation', () => {
    it('rejects when the caller is not the business_owner of the invited company', async () => {
      prisma.firmClientInvitation.findUnique.mockResolvedValue({ id: 'inv-1', status: 'pending', companyId: 'co-1', firmId: FIRM_ID });
      prisma.userCompanyRole.findFirst.mockResolvedValue(null);

      await expect(service.respondToClientInvitation(USER_ID, 'inv-1', true)).rejects.toBeInstanceOf(ForbiddenException);
      expect(prisma.company.update).not.toHaveBeenCalled();
    });

    it('attaches the company to the firm on accept', async () => {
      prisma.firmClientInvitation.findUnique.mockResolvedValue({ id: 'inv-1', status: 'pending', companyId: 'co-1', firmId: FIRM_ID });
      prisma.userCompanyRole.findFirst.mockResolvedValue({ id: 'ucr-1' });
      prisma.company.update.mockResolvedValue({ id: 'co-1', firmId: FIRM_ID });
      prisma.firmClientInvitation.update.mockResolvedValue({ id: 'inv-1', status: 'accepted' });

      await service.respondToClientInvitation(USER_ID, 'inv-1', true);

      expect(prisma.company.update).toHaveBeenCalledWith({ where: { id: 'co-1' }, data: { firmId: FIRM_ID } });
    });

    it('does not touch the company on decline', async () => {
      prisma.firmClientInvitation.findUnique.mockResolvedValue({ id: 'inv-1', status: 'pending', companyId: 'co-1', firmId: FIRM_ID });
      prisma.userCompanyRole.findFirst.mockResolvedValue({ id: 'ucr-1' });
      prisma.firmClientInvitation.update.mockResolvedValue({ id: 'inv-1', status: 'declined' });

      await service.respondToClientInvitation(USER_ID, 'inv-1', false);

      expect(prisma.company.update).not.toHaveBeenCalled();
      expect(prisma.firmClientInvitation.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'declined' }) }),
      );
    });
  });

  describe('assignStaffToCompany', () => {
    it('rejects an unknown permission code rather than silently dropping it', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'co-1', firmId: FIRM_ID });
      prisma.firmMembership.findUnique.mockResolvedValue({ id: 'mem-1', firmId: FIRM_ID, status: 'active' });
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1', code: 'company:read' }]);

      await expect(
        service.assignStaffToCompany(FIRM_ID, USER_ID, 'co-1', 'mem-1', {
          permissionCodes: ['company:read', 'not_a_real_permission'],
        }),
      ).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.firmCompanyAssignment.upsert).not.toHaveBeenCalled();
    });

    it('rejects assigning a company that does not belong to this firm', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'co-1', firmId: 'a-different-firm' });
      await expect(
        service.assignStaffToCompany(FIRM_ID, USER_ID, 'co-1', 'mem-1', { permissionCodes: ['company:read'] }),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('replaces the assignment\'s permission set rather than appending to it', async () => {
      prisma.company.findUnique.mockResolvedValue({ id: 'co-1', firmId: FIRM_ID });
      prisma.firmMembership.findUnique.mockResolvedValue({ id: 'mem-1', firmId: FIRM_ID, status: 'active' });
      prisma.permission.findMany.mockResolvedValue([{ id: 'perm-1', code: 'company:read' }]);
      prisma.firmCompanyAssignment.upsert.mockResolvedValue({ id: 'assignment-1' });
      prisma.firmCompanyAssignment.findUniqueOrThrow.mockResolvedValue({ id: 'assignment-1', permissions: [] });

      await service.assignStaffToCompany(FIRM_ID, USER_ID, 'co-1', 'mem-1', { permissionCodes: ['company:read'] });

      expect(prisma.firmCompanyAssignmentPermission.deleteMany).toHaveBeenCalledWith({ where: { assignmentId: 'assignment-1' } });
      expect(prisma.firmCompanyAssignmentPermission.createMany).toHaveBeenCalledWith({
        data: [{ assignmentId: 'assignment-1', permissionId: 'perm-1' }],
      });
    });
  });

  describe('getFirmDashboard', () => {
    it('returns a clean zeroed dashboard with no queries against per-client tables when the firm has no clients', async () => {
      prisma.firm.findUnique.mockResolvedValue({ id: FIRM_ID });
      prisma.firmMembership.findFirst.mockResolvedValue({ firmRole: { permissions: [{ firmPermission: { code: 'firm:clients:manage' } }] } });
      prisma.company.findMany.mockResolvedValue([]);

      const result = await service.getFirmDashboard(FIRM_ID, USER_ID);

      expect(result.totals.totalClients).toBe(0);
      expect(result.clients).toEqual([]);
      expect(prisma.complianceStatus.findMany).not.toHaveBeenCalled();
    });

    it('aggregates compliance/issue totals across clients correctly', async () => {
      prisma.firm.findUnique.mockResolvedValue({ id: FIRM_ID });
      prisma.firmMembership.findFirst.mockResolvedValue({ firmRole: { permissions: [{ firmPermission: { code: 'firm:clients:manage' } }] } });
      prisma.company.findMany.mockResolvedValue([
        { id: 'co-1', businessName: 'Alpha', tradeName: null, vatClassification: 'vat', status: 'active' },
        { id: 'co-2', businessName: 'Beta', tradeName: null, vatClassification: 'non_vat', status: 'active' },
      ]);
      prisma.complianceStatus.findMany.mockResolvedValue([
        { companyId: 'co-1', compliancePercentage: 80, overdueCount: 1 },
        { companyId: 'co-2', compliancePercentage: 40, overdueCount: 3 },
      ]);
      prisma.flaggedIssue.findMany.mockResolvedValue([
        { companyId: 'co-1', severity: 'high' },
        { companyId: 'co-2', severity: 'critical' },
      ]);
      prisma.filingDeadline.findMany.mockResolvedValue([]);
      prisma.payrollRun.findMany.mockResolvedValue([]);
      prisma.taxComputation.findMany.mockResolvedValue([]);

      const result = await service.getFirmDashboard(FIRM_ID, USER_ID);

      expect(result.totals.totalClients).toBe(2);
      expect(result.totals.avgCompliancePercentage).toBe(60);
      expect(result.totals.totalOverdueFilings).toBe(4);
      expect(result.totals.totalOpenCriticalIssues).toBe(1);
      expect(result.totals.totalOpenHighIssues).toBe(1);
    });
  });
});
