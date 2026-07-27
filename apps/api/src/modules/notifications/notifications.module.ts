import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import {
  NotificationPreferencesController,
  NotificationsController,
} from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { DeadlineReminderJob } from './deadline-reminder.job';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { InAppChannel } from './channels/in-app.channel';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [NotificationsController, NotificationPreferencesController],
  providers: [
    NotificationsService,
    DeadlineReminderJob,
    EmailChannel,
    SmsChannel,
    PushChannel,
    InAppChannel,
  ],
  exports: [NotificationsService],
})
export class NotificationsModule {}
