import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PermissionsGuard } from './permissions.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * PermissionsGuard is the SOLE enforcement point for company-scoped tenant
 * isolation across every controller in this app — every route that takes
 * :companyId relies on it to confirm the caller actually holds an active
 * role on that exact company. A bug here (e.g. the status filter silently
 * dropped, or "any" permission instead of "all" required) would be a
 * cross-tenant access hole, not just a wrong-response bug, so these tests
 * pin down the exact query shape and boolean logic, not just outcomes.
 */
describe('PermissionsGuard', () => {
  let guard: PermissionsGuard;
  let reflector: { getAllAndOverride: jest.Mock };
  let prisma: { userCompanyRole: { findFirst: jest.Mock } };

  function contextWith(request: Record<string, unknown>): ExecutionContext {
    return {
      getHandler: () => ({}),
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  function roleWithPermissions(codes: string[]) {
    return {
      id: 'ucr-1',
      role: { permissions: codes.map((code) => ({ permission: { code } })) },
    };
  }

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    prisma = { userCompanyRole: { findFirst: jest.fn() } };
    guard = new PermissionsGuard(reflector as unknown as Reflector, prisma as unknown as PrismaService);
  });

  it('allows the request through without a DB lookup when the route requires no permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'c1' } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect(prisma.userCompanyRole.findFirst).not.toHaveBeenCalled();
  });

  it('also treats an empty permissions array as "no restriction"', async () => {
    reflector.getAllAndOverride.mockReturnValue([]);
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'c1' } });

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('rejects when there is no authenticated user on the request', async () => {
    reflector.getAllAndOverride.mockReturnValue(['company:read']);
    const ctx = contextWith({ user: undefined, params: { companyId: 'c1' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userCompanyRole.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when the route has no :companyId param', async () => {
    reflector.getAllAndOverride.mockReturnValue(['company:read']);
    const ctx = contextWith({ user: { id: 'u1' }, params: {} });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userCompanyRole.findFirst).not.toHaveBeenCalled();
  });

  it('rejects when the caller has no active role on the target company', async () => {
    reflector.getAllAndOverride.mockReturnValue(['company:read']);
    prisma.userCompanyRole.findFirst.mockResolvedValue(null);
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'c1' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('scopes the lookup to the exact caller, exact company, and active status only', async () => {
    reflector.getAllAndOverride.mockReturnValue(['company:read']);
    prisma.userCompanyRole.findFirst.mockResolvedValue(roleWithPermissions(['company:read']));
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'c1' } });

    await guard.canActivate(ctx);

    expect(prisma.userCompanyRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: { userId: 'u1', companyId: 'c1', status: 'active' } }),
    );
  });

  it('rejects when the role is missing even one of several required permissions', async () => {
    reflector.getAllAndOverride.mockReturnValue(['payroll:read', 'payroll:write']);
    prisma.userCompanyRole.findFirst.mockResolvedValue(roleWithPermissions(['payroll:read']));
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'c1' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows through and attaches the resolved role when every required permission is granted', async () => {
    reflector.getAllAndOverride.mockReturnValue(['payroll:read', 'payroll:write']);
    const role = roleWithPermissions(['payroll:read', 'payroll:write', 'payroll:finalize']);
    prisma.userCompanyRole.findFirst.mockResolvedValue(role);
    const request = { user: { id: 'u1' }, params: { companyId: 'c1' } };
    const ctx = contextWith(request);

    await expect(guard.canActivate(ctx)).resolves.toBe(true);
    expect((request as Record<string, unknown>).userCompanyRole).toBe(role);
  });

  it('never grants access to a different company than the one in the route', async () => {
    // A caller who has a role on company A must not pass a request for
    // company B just because prisma was (hypothetically) queried without
    // the companyId filter — assert the filter is always present and
    // scoped to the route's own companyId, not any company the user
    // happens to belong to.
    reflector.getAllAndOverride.mockReturnValue(['company:read']);
    prisma.userCompanyRole.findFirst.mockResolvedValue(null);
    const ctx = contextWith({ user: { id: 'u1' }, params: { companyId: 'company-b' } });

    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.userCompanyRole.findFirst).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ companyId: 'company-b' }) }),
    );
  });
});
