import { Controller, Get, Param, ParseIntPipe, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { AuditService } from '../audit/audit.service';
import { AdminGuard } from '../identity/guards/admin.guard';

// A non-numeric ?take= previously produced NaN, which Prisma rejects with an
// ungraceful 500 instead of a clean 400 — ParseIntPipe validates it up front,
// and clamping the range prevents both a 0/negative `take` (Prisma errors)
// and an unbounded one (a very large `take` doing a needless full table scan).
const TAKE_PIPE = new ParseIntPipe({ optional: true });
const MAX_TAKE = 500;

@ApiTags('admin')
@ApiBearerAuth('access-token')
@Controller('admin')
@UseGuards(AdminGuard)
export class AdminAuditController {
  constructor(private readonly auditService: AuditService) {}

  @Get('audit-logs/:companyId')
  async listAuditLogs(
    @Param('companyId') companyId: string,
    @Query('take', TAKE_PIPE) take?: number,
  ) {
    return this.auditService.listForCompany(companyId, clampTake(take));
  }

  @Get('security-events')
  async listSecurityEvents(@Query('take', TAKE_PIPE) take?: number) {
    return this.auditService.listSecurityEvents(clampTake(take));
  }
}

function clampTake(take?: number): number | undefined {
  if (take === undefined) return undefined;
  return Math.min(Math.max(take, 1), MAX_TAKE);
}
