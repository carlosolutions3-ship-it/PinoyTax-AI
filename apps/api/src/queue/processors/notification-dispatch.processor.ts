import { Processor, WorkerHost } from '@nestjs/bullmq';
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
}
