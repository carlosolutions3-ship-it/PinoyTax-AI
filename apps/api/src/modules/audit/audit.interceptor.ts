import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { AuditService } from './audit.service';
import { AUDIT_METADATA_KEY, AuditMetadata } from './audit.decorator';

@Injectable()
export class AuditInterceptor implements NestInterceptor {
  constructor(
    private readonly reflector: Reflector,
    private readonly auditService: AuditService,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const metadata = this.reflector.getAllAndOverride<AuditMetadata | undefined>(
      AUDIT_METADATA_KEY,
      [context.getHandler(), context.getClass()],
    );

    if (!metadata) {
      return next.handle();
    }

    const request = context.switchToHttp().getRequest();
    const beforeState = { params: request.params, body: request.body };

    return next.handle().pipe(
      tap((responseBody) => {
        const params = request.params ?? {};
        const entityIdParam = Object.keys(params).find(
          (key) => key !== 'companyId' && key.toLowerCase().endsWith('id'),
        );

        void this.auditService.record({
          companyId: params.companyId,
          actorUserId: request.user?.id,
          action: metadata.action,
          entityType: metadata.entityType,
          entityId: entityIdParam ? params[entityIdParam] : undefined,
          beforeState,
          afterState: responseBody,
          ipAddress: request.ip,
        });
      }),
    );
  }
}
