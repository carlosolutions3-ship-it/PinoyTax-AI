import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super({
      log: [
        { emit: 'event', level: 'query' },
        { emit: 'stdout', level: 'error' },
        { emit: 'stdout', level: 'warn' },
      ],
    });
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Connected to PostgreSQL via Prisma');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
  }

  /**
   * Opt-in helper for running a block of queries with PostgreSQL's
   * app.current_company_id session variable set, so the Row-Level Security
   * policies from the `row_level_security` migration apply for that block
   * (see Phase 2 §14).
   *
   * IMPORTANT — current status: no request path in this codebase calls this
   * method yet. Every service in `src/modules/**` enforces tenant isolation
   * today by explicitly filtering every query with `where: { companyId }`
   * (or via a route param cross-checked by PermissionsGuard) — that
   * application-layer filtering is the actual, active isolation boundary
   * right now. Because app.current_company_id is never set on the normal
   * request path, the RLS policies fall back to their permissive branch
   * (see the migration's policy definition) and are not yet an active
   * second layer of defense. Wiring this in for real would mean routing
   * every Prisma call for a request through the same transaction-scoped
   * client this method provides — a larger refactor than a single-file fix,
   * tracked as a follow-up rather than silently claimed as done. Use this
   * method directly for any new code that needs the DB-level guarantee now.
   */
  async withTenantContext<T>(companyId: string, fn: (tx: PrismaClient) => Promise<T>): Promise<T> {
    const UUID_PATTERN =
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    if (!UUID_PATTERN.test(companyId)) {
      // SET LOCAL cannot bind parameters, so we defensively validate the shape
      // of companyId ourselves rather than trusting the caller.
      throw new Error('Invalid companyId supplied to tenant context');
    }

    return this.$transaction(async (tx) => {
      await tx.$executeRawUnsafe(`SET LOCAL app.current_company_id = '${companyId}'`);
      return fn(tx as unknown as PrismaClient);
    });
  }
}
