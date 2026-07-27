import {
  CanActivate,
  ExecutionContext,
  ForbiddenException,
  Injectable,
} from '@nestjs/common';
import { PrismaService } from '../../../common/prisma/prisma.service';

/**
 * Guards platform administration endpoints (Module: Administrator in the
 * original spec — full system access, user management, subscription
 * management, system configuration, audit logs, security monitoring).
 *
 * This is deliberately separate from PermissionsGuard: platform
 * administration is not scoped to a single company, so it cannot be
 * expressed via user_company_roles. It is gated by users.is_platform_admin,
 * a flag never settable via self-service registration. As of this writing
 * the only way to set it is direct database access — no admin-management
 * endpoint exists yet in modules/admin (only audit-log/security-event
 * viewing does); build one (with its own heavy audit trail) before
 * granting/revoking platform-admin needs to happen outside a DB console.
 */
@Injectable()
export class AdminGuard implements CanActivate {
  constructor(private readonly prisma: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest();
    const user = request.user;

    if (!user) {
      throw new ForbiddenException({ code: 'FORBIDDEN', message: 'Authentication required.' });
    }

    const dbUser = await this.prisma.user.findUnique({ where: { id: user.id } });
    if (!dbUser?.isPlatformAdmin) {
      throw new ForbiddenException({
        code: 'FORBIDDEN',
        message: 'Platform administrator access required.',
      });
    }

    return true;
  }
}
