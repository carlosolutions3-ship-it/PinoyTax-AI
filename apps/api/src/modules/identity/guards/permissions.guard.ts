import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { PrismaService } from '../../../common/prisma/prisma.service';
import { PERMISSIONS_KEY } from '../../../common/decorators/require-permissions.decorator';

/**
 * Checks that the authenticated user has access to the company identified
 * by the route's `:companyId` param, and that access grants every
 * permission listed via @RequirePermissions(...) on the handler.
 *
 * Access can come from either of two independent sources, unioned together:
 *  1. A direct, ACTIVE org.user_company_roles grant (company-level RBAC —
 *     unchanged from before firm support existed).
 *  2. An ACTIVE org.firm_company_assignments grant, reached through an
 *     ACTIVE org.firm_memberships row for this user (firm-level RBAC — a
 *     firm staffer never needs a direct company role to work a client).
 * Both sources speak the same identity.permissions vocabulary, so a route
 * doesn't need to know or care which source satisfied it.
 *
 * This guard is route-level defense; any service method that mutates
 * financial/compliance data re-checks permissions itself (see Phase 1 §5.3 —
 * "never trust the route guard alone for money-moving actions").
 */
@Injectable()
export class PermissionsGuard implements CanActivate {
  constructor(
    private readonly reflector: Reflector,
    private readonly prisma: PrismaService,
  ) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const requiredPermissions = this.reflector.getAllAndOverride<string[]>(
      PERMISSIONS_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!requiredPermissions || requiredPermissions.length === 0) {
      return true;
    }

    const request = context.switchToHttp().getRequest();
    const user = request.user;
    const companyId = request.params?.companyId;

    if (!user || !companyId) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this resource.',
      });
    }

    const [userCompanyRole, firmCompanyAssignment] = await Promise.all([
      this.prisma.userCompanyRole.findFirst({
        where: { userId: user.id, companyId, status: 'active' },
        include: { role: { include: { permissions: { include: { permission: true } } } } },
      }),
      this.prisma.firmCompanyAssignment.findFirst({
        where: {
          companyId,
          status: 'active',
          firmMembership: { userId: user.id, status: 'active' },
        },
        include: { permissions: { include: { permission: true } } },
      }),
    ]);

    if (!userCompanyRole && !firmCompanyAssignment) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this company.',
      });
    }

    const grantedCodes = new Set<string>();
    for (const rp of userCompanyRole?.role.permissions ?? []) {
      grantedCodes.add(rp.permission.code);
    }
    for (const ap of firmCompanyAssignment?.permissions ?? []) {
      grantedCodes.add(ap.permission.code);
    }
    const hasAll = requiredPermissions.every((code) => grantedCodes.has(code));

    if (!hasAll) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your role does not permit this action.',
      });
    }

    // Attach for downstream handlers/services that want it without re-querying.
    request.userCompanyRole = userCompanyRole;
    request.firmCompanyAssignment = firmCompanyAssignment;
    return true;
  }
}
