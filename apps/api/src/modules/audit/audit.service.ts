import { Injectable } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';

interface RecordAuditParams {
  companyId?: string;
  actorUserId?: string;
  action: string;
  entityType?: string;
  entityId?: string;
  beforeState?: unknown;
  afterState?: unknown;
  ipAddress?: string;
}

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The application's database role has UPDATE and DELETE revoked on
   * audit.audit_logs (see infrastructure/sql/audit_append_only.sql) — this
   * method only ever calls `create`, matching that guarantee at both the
   * application and database layers (Phase 2 §11).
   */
  async record(params: RecordAuditParams): Promise<void> {
    await this.prisma.auditLog.create({
      data: {
        companyId: params.companyId,
        actorUserId: params.actorUserId,
        action: params.action,
        entityType: params.entityType,
        entityId: params.entityId,
        beforeState: params.beforeState as object,
        afterState: params.afterState as object,
        ipAddress: params.ipAddress,
      },
    });
  }

  async listForCompany(companyId: string, take = 100) {
    return this.prisma.auditLog.findMany({
      where: { companyId },
      orderBy: { createdAt: 'desc' },
      take,
    });
  }

  async listSecurityEvents(take = 100) {
    return this.prisma.securityEvent.findMany({
      orderBy: { createdAt: 'desc' },
      take,
    });
  }
}
