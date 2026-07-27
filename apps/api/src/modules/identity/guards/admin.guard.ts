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
 * a flag only settable directly in the database or by another platform
 * admin via a dedicated (heavily audited) endpoint — never via self-service
 * registration.
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
