import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { FirmPermissionsGuard } from './firm-permissions.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';

describe('FirmPermissionsGuard', () => {
  let guard: FirmPermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { firmMembership: { findFirst: jest.Mock } };

  function contextWith(request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function membershipWithPermissions(codes: string[]) {
    return {
      id: 'mem-1',
      firmRole: { permissions: codes.map((code) => ({ firmPermission: { code } })) },
    };
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { firmMembership: { findFirst: jest.fn() } };
    guard = new FirmPermissionsGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it('allows the request through without a DB lookup when the route requires no firm permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = contextWith({ user: { id: 'u1' }, params: { firmId: 'f1' } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.firmMembership.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when there is no authenticated user', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:manage']);
    const ctx = contextWith({ user: undefined, params: { firmId: 'f1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the route has no :firmId param', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:manage']);
    const ctx = contextWith({ user: { id: 'u1' }, params: {} });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the caller has no active membership on the target firm', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:dashboard:view']);
    prisma.firmMembership.findFirst.mockResolvedValue(null);
    const ctx = contextWith({ user: { id: 'u1' }, params: { firmId: 'f1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the lookup to the exact caller, exact firm, and active status only', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:dashboard:view']);
    prisma.firmMembership.findFirst.mockResolvedValue(membershipWithPermissions(['firm:dashboard:view']));
    const ctx = contextWith({ user: { id: 'u1' }, params: { firmId: 'f1' } });

    await guard.canActivate(ctx);

    expect(prisma.firmMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', firmId: 'f1', status: 'active' } }),
    );
  });

  it('rejects when the firm role is missing even one required permission', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:clients:manage', 'firm:clients:assign']);
    prisma.firmMembership.findFirst.mockResolvedValue(membershipWithPermissions(['firm:clients:manage']));
    const ctx = contextWith({ user: { id: 'u1' }, params: { firmId: 'f1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows through and attaches the resolved membership when every required permission is granted', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:dashboard:view']);
    const membership = membershipWithPermissions(['firm:dashboard:view', 'firm:manage']);
    prisma.firmMembership.findFirst.mockResolvedValue(membership);
    const request = { user: { id: 'u1' }, params: { firmId: 'f1' } };
    const ctx = contextWith(request);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((request as Record<string, unknown>).firmMembership).toBe(membership);
  });

  it('never grants access to a different firm than the one in the route', async () => {
    reflector.getAllAndOverride.mockReturnValue(['firm:dashboard:view']);
    prisma.firmMembership.findFirst.mockResolvedValue(null);
    const ctx = contextWith({ user: { id: 'u1' }, params: { firmId: 'firm-b' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.firmMembership.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ firmId: 'firm-b' }) }),
    );
  });
});
