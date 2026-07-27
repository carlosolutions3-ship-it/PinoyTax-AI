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
 * Checks that the authenticated user holds an ACTIVE role on the company
 * identified by the route's `:companyId` param, and that role grants every
 * permission listed via @RequirePermissions(...) on the handler.
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

    const userCompanyRole = await this.prisma.userCompanyRole.findFirst({
      where: { userId: user.id, companyId, status: 'active' },
      include: { role: { include: { permissions: { include: { permission: true } } } } },
    });

    if (!userCompanyRole) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'You do not have access to this company.',
      });
    }

    const grantedCodes = new Set(
      userCompanyRole.role.permissions.map((rp) => rp.permission.code),
    );
    const hasAll = requiredPermissions.every((code) => grantedCodes.has(code));

    if (!hasAll) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Your role does not permit this action.',
      });
    }

    // Attach for downstream handlers/services that want it without re-querying.
    request.userCompanyRole = userCompanyRole;
    return true;
  }
}
