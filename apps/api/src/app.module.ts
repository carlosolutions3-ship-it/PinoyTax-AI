import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configFactories from './config';
import { envValidationSchema } from './config/env.validation';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { AuditModule } from './modules/audit/audit.module';
import { IdentityModule } from './modules/identity/identity.module';
import { JwtAuthGuard } from './modules/identity/guards/jwt-auth.guard';
import { OrgModule } from './modules/org/org.module';
import { PayrollModule } from './modules/payroll/payroll.module';
import { TaxEngineModule } from './modules/tax-engine/tax-engine.module';
import { ComplianceModule } from './modules/compliance/compliance.module';
import { AiModule } from './modules/ai/ai.module';
import { DocumentsModule } from './modules/documents/documents.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { AdminModule } from './modules/admin/admin.module';
import { FormsModule } from './modules/forms/forms.module';
import { QueueModule } from './queue/queue.module';
import { MessagingModule } from './messaging/messaging.module';
import { HealthModule } from './health/health.module';
import { AppLoggerModule } from './logging/logger.module';

@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({
      isGlobal: true,
      load: configFactories,
      validationSchema: envValidationSchema,
    }),
    EventEmitterModule.forRoot(),
    ThrottlerModule.forRoot({
      throttlers: [{ ttl: 60_000, limit: 120 }], // general API default; auth endpoints override per-route
    }),
    PrismaModule,
    StorageModule,
    AuditModule,
    IdentityModule,
    OrgModule,
    PayrollModule,
    TaxEngineModule,
    ComplianceModule,
    AiModule,
    DocumentsModule,
    NotificationsModule,
    AdminModule,
    FormsModule,
    QueueModule,
    MessagingModule,
    HealthModule,
  ],
  providers: [
    // Every route requires authentication by default; use @Public() to opt out.
    { provide: APP_GUARD, useClass: JwtAuthGuard },
    { provide: APP_GUARD, useClass: ThrottlerGuard },
  ],
})
export class AppModule {}
