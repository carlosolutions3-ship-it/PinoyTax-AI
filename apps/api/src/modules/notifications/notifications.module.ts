import { Module } from '@nestjs/common';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { InAppChannel } from './channels/in-app.channel';

// Scheduling (DeadlineReminderJob's @Cron) lives in
// NotificationsSchedulingModule, imported only by the worker process — see
// that module's doc comment for why it must not also run in the API.
@Module({
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [NotificationsService, EmailChannel, SmsChannel, PushChannel, InAppChannel],
  exports: [NotificationsService],
})
export class NotificationsModule {}
