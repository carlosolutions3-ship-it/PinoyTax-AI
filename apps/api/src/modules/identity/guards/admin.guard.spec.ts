import { ExecutionContext, ForbiddenException } from '@nestjs/common';
import { AdminGuard } from './admin.guard';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * AdminGuard is the sole gate on platform-administration endpoints
 * (currently audit-log/security-event viewing — see admin/admin-audit.
 * controller.ts). Unlike PermissionsGuard it isn't company-scoped, so the
 * only thing standing between an ordinary user and platform-wide audit
 * data is the users.is_platform_admin boolean this guard reads fresh from
 * the database on every request (never trusting a stale claim on the JWT).
 */
describe('AdminGuard', () => {
  let guard: AdminGuard;
  let prisma: { user: { findUnique: jest.Mock } };

  function contextWith(request: Record<string, unknown>): ExecutionContext {
    return {
      switchToHttp: () => ({ getRequest: () => request }),
    } as unknown as ExecutionContext;
  }

  beforeEach(() => {
    prisma = { user: { findUnique: jest.fn() } };
    guard = new AdminGuard(prisma as unknown as PrismaService);
  });

  it('rejects when there is no authenticated user on the request', async () => {
    const ctx = contextWith({ user: undefined });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).not.toHaveBeenCalled();
  });

  it('rejects a regular (non-admin) authenticated user', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isPlatformAdmin: false });
    const ctx = contextWith({ user: { id: 'u1' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('rejects when the user referenced by the token no longer exists', async () => {
    prisma.user.findUnique.mockResolvedValue(null);
    const ctx = contextWith({ user: { id: 'deleted-user' } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('allows a platform admin through', async () => {
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isPlatformAdmin: true });
    const ctx = contextWith({ user: { id: 'u1' } });
    await expect(guard.canActivate(ctx)).resolves.toBe(true);
  });

  it('always re-checks the database rather than trusting a flag on the request/JWT', async () => {
    // Even if something upstream attached isPlatformAdmin: true directly to
    // request.user, the guard must still hit the DB — a stale/forged claim
    // on the token must never be trusted for a platform-wide capability.
    prisma.user.findUnique.mockResolvedValue({ id: 'u1', isPlatformAdmin: false });
    const ctx = contextWith({ user: { id: 'u1', isPlatformAdmin: true } });
    await expect(guard.canActivate(ctx)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.user.findUnique).toHaveBeenCalledWith({ where: { id: 'u1' } });
  });
});
