import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';
import { NotificationsService } from '../../modules/notifications/notifications.service';
import { QUEUE_NAMES } from '../queue-names';

export interface NotificationDispatchJobData {
  userId: string;
  companyId?: string;
  category: string;
  title: string;
  body: string;
  recipientAddressByChannel: Partial<Record<'email' | 'sms' | 'push', string>>;
  relatedDeadlineId?: string;
}

@Processor(QUEUE_NAMES.NOTIFICATION_DISPATCH)
export class NotificationDispatchProcessor extends WorkerHost {
  private readonly logger = new Logger(NotificationDispatchProcessor.name);

  constructor(private readonly notificationsService: NotificationsService) {
    super();
  }

  async process(job: Job<NotificationDispatchJobData>): Promise<void> {
    this.logger.log(`Dispatching notification job ${job.id} to user ${job.data.userId}`);
    await this.notificationsService.dispatch(job.data);
  }

  // See the identical comment in compliance-scan.processor.ts — without
  // this, a notification (e.g. a filing-deadline reminder) that exhausts
  // every retry disappears into Redis with no distinguishable log signal.
  @OnWorkerEvent('failed')
  onFailed(job: Job<NotificationDispatchJobData>, error: Error): void {
    const attempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= attempts) {
      this.logger.error(
        `Notification job ${job.id} (${job.data.category} for user ${job.data.userId}) failed permanently after ${attempts} attempts: ${error.message}`,
        error.stack,
      );
    } else {
      this.logger.warn(
        `Notification job ${job.id} (${job.data.category} for user ${job.data.userId}) failed (attempt ${job.attemptsMade}/${attempts}), will retry: ${error.message}`,
      );
    }
  }
}
