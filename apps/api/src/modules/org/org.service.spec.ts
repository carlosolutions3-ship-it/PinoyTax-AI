import { BadRequestException, NotFoundException } from '@nestjs/common';
import { OrgService } from './org.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { RabbitMqService } from '../../messaging/rabbitmq.service';

describe('OrgService', () => {
  let service: OrgService;
  let prisma: {
    userCompanyRole: { findMany: jest.Mock; findFirst: jest.Mock; findUnique: jest.Mock; update: jest.Mock; create: jest.Mock };
    role: { findUniqueOrThrow: jest.Mock };
    user: { findUnique: jest.Mock };
  };

  const USER_ID = 'user-1';
  const COMPANY_ID = 'company-1';

  beforeEach(() => {
    prisma = {
      userCompanyRole: {
        findMany: jest.fn(),
        findFirst: jest.fn(),
        findUnique: jest.fn(),
        update: jest.fn(),
        create: jest.fn(),
      },
      role: { findUniqueOrThrow: jest.fn() },
      user: { findUnique: jest.fn() },
    };
    service = new OrgService(
      prisma as unknown as PrismaService,
      { emit: jest.fn() } as unknown as EventEmitter2,
      { publish: jest.fn() } as unknown as RabbitMqService,
    );
  });

  describe('listMyInvitations', () => {
    it('lists only this user\'s pending invitations', async () => {
      prisma.userCompanyRole.findMany.mockResolvedValue([]);
      await service.listMyInvitations(USER_ID);
      expect(prisma.userCompanyRole.findMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { userId: USER_ID, status: 'pending' } }),
      );
    });
  });

  describe('acceptInvitation', () => {
    it('activates a pending invitation belonging to the caller', async () => {
      prisma.userCompanyRole.findFirst.mockResolvedValue({ id: 'ucr-1', userId: USER_ID, status: 'pending' });
      prisma.userCompanyRole.update.mockResolvedValue({ id: 'ucr-1', status: 'active' });

      const result = await service.acceptInvitation(USER_ID, 'ucr-1');

      expect(prisma.userCompanyRole.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: 'ucr-1', userId: USER_ID, status: 'pending' } }),
      );
      expect(result.status).toBe('active');
    });

    it('rejects accepting an invitation that does not belong to the caller', async () => {
      prisma.userCompanyRole.findFirst.mockResolvedValue(null);
      await expect(service.acceptInvitation(USER_ID, 'ucr-1')).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.userCompanyRole.update).not.toHaveBeenCalled();
    });
  });

  describe('inviteStaff', () => {
    it('rejects inviting an email with no registered account', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.inviteStaff(COMPANY_ID, USER_ID, { email: 'nobody@example.com', roleCode: 'accountant' }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.userCompanyRole.create).not.toHaveBeenCalled();
    });
  });

  describe('revokeStaff', () => {
    it('rejects revoking the business_owner role', async () => {
      prisma.userCompanyRole.findUnique.mockResolvedValue({
        id: 'ucr-1',
        companyId: COMPANY_ID,
        role: { code: 'business_owner' },
      });
      await expect(service.revokeStaff(COMPANY_ID, 'ucr-1')).rejects.toBeInstanceOf(BadRequestException);
      expect(prisma.userCompanyRole.update).not.toHaveBeenCalled();
    });

    it('rejects revoking a staff role scoped to a different company', async () => {
      prisma.userCompanyRole.findUnique.mockResolvedValue({
        id: 'ucr-1',
        companyId: 'other-company',
        role: { code: 'accountant' },
      });
      await expect(service.revokeStaff(COMPANY_ID, 'ucr-1')).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
