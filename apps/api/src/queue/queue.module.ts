import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QUEUE_NAMES } from './queue-names';
import { ComplianceScanProcessor } from './processors/compliance-scan.processor';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { QueueProducerService } from './queue-producer.service';
import { ComplianceModule } from '../modules/compliance/compliance.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';

@Global()
@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        // BullMQ requires either connection options or a Redis instance
        // constructed with maxRetriesPerRequest: null (blocking commands like
        // BRPOPLPUSH used internally would otherwise fail against ioredis's
        // default retry behavior).
        connection: new Redis(config.get<string>('queue.redisUrl') as string, {
          maxRetriesPerRequest: null,
        }),
        defaultJobOptions: {
          attempts: 3,
          backoff: { type: 'exponential', delay: 5000 },
          removeOnComplete: 500,
          removeOnFail: 1000,
        },
      }),
    }),
    BullModule.registerQueue(
      { name: QUEUE_NAMES.COMPLIANCE_SCAN },
      { name: QUEUE_NAMES.NOTIFICATION_DISPATCH },
    ),
    ComplianceModule,
    NotificationsModule,
  ],
  providers: [ComplianceScanProcessor, NotificationDispatchProcessor, QueueProducerService],
  exports: [BullModule, QueueProducerService],
})
export class QueueModule {}

