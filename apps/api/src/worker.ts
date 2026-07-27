import { NestFactory } from '@nestjs/core';
import { Logger } from 'nestjs-pino';
import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { EventEmitterModule } from '@nestjs/event-emitter';
import configFactories from './config';
import { AppLoggerModule } from './logging/logger.module';
import { PrismaModule } from './common/prisma/prisma.module';
import { StorageModule } from './common/storage/storage.module';
import { MessagingModule } from './messaging/messaging.module';
import { QueueModule } from './queue/queue.module';
import { NotificationsModule } from './modules/notifications/notifications.module';
import { ComplianceModule } from './modules/compliance/compliance.module';

/**
 * Worker process module — everything the BullMQ processors and scheduled
 * jobs need, with NO HTTP controllers. Deployed as a separate Kubernetes
 * deployment/replica set from the API (see Phase 1 §1's recommendation to
 * let latency-sensitive and background-processing workloads scale
 * independently). Run with `node dist/worker.js`.
 */
@Module({
  imports: [
    AppLoggerModule,
    ConfigModule.forRoot({ isGlobal: true, load: configFactories }),
    EventEmitterModule.forRoot(),
    PrismaModule,
    StorageModule,
    MessagingModule,
    ComplianceModule,
    NotificationsModule,
    QueueModule,
  ],
})
class WorkerModule {}

async function bootstrapWorker() {
  const app = await NestFactory.createApplicationContext(WorkerModule, { bufferLogs: true });
  app.useLogger(app.get(Logger));
  app.enableShutdownHooks();
  app.get(Logger).log('PinoyTax AI worker process started — listening for queued jobs');
}

bootstrapWorker();
