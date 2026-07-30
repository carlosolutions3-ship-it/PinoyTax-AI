import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { FIRM_PERMISSIONS_KEY } from '../../../common/decorators/require-firm-permissions.decorator';

/**
 * Checks that the authenticated user holds an ACTIVE org.firm_memberships
 * row on the firm identified by the route's `:firmId` param, and that
 * membership's firm role grants every permission listed via
 * @RequireFirmPermissions(...) on the handler.
 *
 * This governs FIRM-scoped actions only (managing the firm, inviting firm
 * staff, onboarding/removing clients, assigning staff to clients). It never
 * grants access to a client company's own resources — that's
 * PermissionsGuard's job, satisfied separately via FirmCompanyAssignment.
 */
@Injectable()
export class FirmPermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      FIRM_PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const firmId = request.params?.firmId;

    if (!user || !firmId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource.',
      });
    }

    const membership = await this.prisma.firmMembership.findFirst({
      where: { userId: user.id, firmId, status: 'active' },
      include: { firmRole: { include: { permissions: { include: { firmPermission: true } } } } },
    });

    if (!membership) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this firm.',
      });
    }

    const grantedCodes = new Set(
      membership.firmRole.permissions.map((rp) => rp.firmPermission.code),
    );
    const hasAll = requiredPermissions.every((code) => grantedCodes.has(code));

    if (!hasAll) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your firm role does not permit this action.',
      });
    }

    request.firmMembership = membership;
    return true;
  }
}
