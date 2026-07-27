import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { DeadlineReminderJob } from './deadline-reminder.job';
import { NotificationsModule } from './notifications.module';
import { QueueModule } from '../../queue/queue.module';

/**
 * Registers DeadlineReminderJob's @Cron(EVERY_DAY_AT_6AM). Imported only by
 * worker.ts, never by app.module.ts — the API and worker are separate
 * deployments that can each run multiple replicas (see worker.ts's own doc
 * comment), and a cron job registered in a module imported by both would
 * fire once per replica of BOTH deployments with no leader election,
 * sending duplicate reminder notifications. Keeping it worker-only means
 * it fires once per worker replica; if the worker itself is ever scaled
 * beyond one replica, this job will need an explicit distributed lock.
 */
@Module({
  imports: [ScheduleModule.forRoot(), NotificationsModule, QueueModule],
  providers: [DeadlineReminderJob],
})
export class NotificationsSchedulingModule {}
