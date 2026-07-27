import { Injectable } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { QUEUE_NAMES } from './queue-names';
import { ComplianceScanJobData } from './processors/compliance-scan.processor';
import { NotificationDispatchJobData } from './processors/notification-dispatch.processor';

@Injectable()
export class QueueProducerService {
  constructor(
    @InjectQueue(QUEUE_NAMES.COMPLIANCE_SCAN) private readonly complianceScanQueue: Queue,
    @InjectQueue(QUEUE_NAMES.NOTIFICATION_DISPATCH) private readonly notificationQueue: Queue,
  ) {}

  async enqueueComplianceScan(data: ComplianceScanJobData): Promise<void> {
    await this.complianceScanQueue.add('scan', data);
  }

  async enqueueNotification(data: NotificationDispatchJobData): Promise<void> {
    await this.notificationQueue.add('dispatch', data);
  }
}
