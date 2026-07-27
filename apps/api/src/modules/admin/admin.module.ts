import { Module } from '@nestjs/common';
import { AdminAuditController } from './admin-audit.controller';
import { AuditModule } from '../audit/audit.module';

@Module({
  imports: [AuditModule],
  controllers: [AdminAuditController],
})
export class AdminModule {}
