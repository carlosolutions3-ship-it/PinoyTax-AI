import {
  CallHandler,
  ExecutionContext,
  Injectable,
  NestInterceptor,
} from '@nestjs/common';
import { Observable } from 'rxjs';
import { map } from 'rxjs/operators';

/**
 * Wraps every successful response in the standard PinoyTax AI API envelope:
 * { data, meta, errors: [] }
 * Errors are handled separately by AllExceptionsFilter, which uses the same shape.
 */
@Injectable()
export class ResponseInterceptor implements NestInterceptor {
  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const request = context.switchToHttp().getRequest();

    return next.handle().pipe(
      map((data) => ({
        data: data ?? null,
        meta: {
          // Falls back to pino-http's auto-generated id (see logger.module.ts's
          // genReqId) — the client never actually sends x-request-id today, so
          // without this fallback every response's requestId was silently
          // undefined, making it useless for correlating a user's bug report
          // back to the matching structured log line.
          requestId: (request.headers['x-request-id'] as string | undefined) ?? request.id,
          timestamp: new Date().toISOString(),
        },
        errors: [],
      })),
    );
  }
}
