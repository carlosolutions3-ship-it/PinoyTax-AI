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
          requestId: request.headers['x-request-id'] ?? undefined,
          timestamp: new Date().toISOString(),
        },
        errors: [],
      })),
    );
  }
}
