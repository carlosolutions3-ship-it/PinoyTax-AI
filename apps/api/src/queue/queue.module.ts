import { Global, Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import Redis from 'ioredis';
import { QUEUE_NAMES } from './queue-names';
import { QueueProducerService } from './queue-producer.service';

// Producer-only: the BullMQ connection, queue registrations, and
// QueueProducerService. Safe to import from both the API and the worker.
// Job *consumers* (the @Processor classes) live in QueueProcessorsModule,
// imported only by worker.ts — see that module's doc comment.
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
  ],
  providers: [QueueProducerService],
  exports: [BullModule, QueueProducerService],
})
export class QueueModule {}

