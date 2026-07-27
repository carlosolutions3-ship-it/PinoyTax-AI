import { Module } from '@nestjs/common';
import { ComplianceScanProcessor } from './processors/compliance-scan.processor';
import { NotificationDispatchProcessor } from './processors/notification-dispatch.processor';
import { QueueModule } from './queue.module';
import { ComplianceModule } from '../modules/compliance/compliance.module';
import { NotificationsModule } from '../modules/notifications/notifications.module';

/**
 * The BullMQ job consumers (@Processor classes). Imported only by
 * worker.ts, never by app.module.ts — see worker.ts's own doc comment on
 * why job consumption is meant to scale independently of the HTTP API.
 * QueueModule (producer-only) stays imported by both, since the API needs
 * QueueProducerService to enqueue jobs.
 */
@Module({
  imports: [QueueModule, ComplianceModule, NotificationsModule],
  providers: [ComplianceScanProcessor, NotificationDispatchProcessor],
})
export class QueueProcessorsModule {}
