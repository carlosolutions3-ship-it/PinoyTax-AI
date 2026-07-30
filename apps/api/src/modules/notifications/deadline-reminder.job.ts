import { Injectable, Logger } from '@nestjs/common';
import { Cron, CronExpression } from '@nestjs/schedule';
import { PrismaService } from '../../common/prisma/prisma.service';
import { QueueProducerService } from '../../queue/queue-producer.service';

const REMINDER_DAYS_BEFORE = [30, 14, 7, 3, 1];

@Injectable()
export class DeadlineReminderJob {
  private readonly logger = new Logger(DeadlineReminderJob.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly queueProducer: QueueProducerService,
  ) {}

  @Cron(CronExpression.EVERY_DAY_AT_6AM)
  async run(): Promise<void> {
    this.logger.log('Running daily filing deadline reminder scan');

    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Isolated at the top level too: an uncaught rejection inside a Nest
    // @Cron handler is only logged generically and never retried, so a
    // failure in status updates must not also prevent reminders (and vice
    // versa) — each phase runs independently of the other's outcome.
    try {
      await this.updateDeadlineStatuses(today);
    } catch (err) {
      this.logger.error(
        `Failed to update deadline statuses: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }

    try {
      await this.sendUpcomingReminders(today);
    } catch (err) {
      this.logger.error(
        `Failed to send upcoming deadline reminders: ${(err as Error).message}`,
        (err as Error).stack,
      );
    }
  }

  private async updateDeadlineStatuses(today: Date): Promise<void> {
    await this.prisma.filingDeadline.updateMany({
      where: { dueDate: { lt: today }, status: { in: ['upcoming', 'due_today'] } },
      data: { status: 'overdue' },
    });
    await this.prisma.filingDeadline.updateMany({
      where: {
        dueDate: { gte: today, lt: new Date(today.getTime() + 24 * 60 * 60 * 1000) },
        status: 'upcoming',
      },
      data: { status: 'due_today' },
    });
  }

  private async sendUpcomingReminders(today: Date): Promise<void> {
    for (const daysBefore of REMINDER_DAYS_BEFORE) {
      try {
        await this.sendRemindersForWindow(today, daysBefore);
      } catch (err) {
        // One bad reminder window (e.g. a malformed deadline row) must not
        // take out the other four — each is a fully independent batch of
        // notifications for different companies.
        this.logger.error(
          `Failed to send reminders for the ${daysBefore}-day window: ${(err as Error).message}`,
          (err as Error).stack,
        );
      }
    }
  }

  private async sendRemindersForWindow(today: Date, daysBefore: number): Promise<void> {
    const targetDate = new Date(today.getTime() + daysBefore * 24 * 60 * 60 * 1000);
    const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

    const deadlines = await this.prisma.filingDeadline.findMany({
      where: {
        dueDate: { gte: targetDate, lt: nextDay },
        status: { in: ['upcoming', 'due_today'] },
      },
    });
    if (deadlines.length === 0) return;

    // Batched instead of one userCompanyRole query per deadline — companies
    // with deadlines due in this window are typically a small, overlapping
    // set, so a single IN-query plus in-memory grouping avoids N+1 queries.
    const companyIds = [...new Set(deadlines.map((d) => d.companyId))];
    const owners = await this.prisma.userCompanyRole.findMany({
      where: { companyId: { in: companyIds }, status: 'active' },
      include: { user: true },
    });
    const ownersByCompany = new Map<string, typeof owners>();
    for (const owner of owners) {
      const list = ownersByCompany.get(owner.companyId) ?? [];
      list.push(owner);
      ownersByCompany.set(owner.companyId, list);
    }

    for (const deadline of deadlines) {
      const companyOwners = ownersByCompany.get(deadline.companyId) ?? [];
      for (const owner of companyOwners) {
        try {
          await this.queueProducer.enqueueNotification({
            userId: owner.userId,
            companyId: deadline.companyId,
            category: 'filing_deadline',
            title: `${deadline.formCode} due in ${daysBefore} day${daysBefore === 1 ? '' : 's'}`,
            body: `Your ${deadline.agency.toUpperCase()} ${deadline.formCode} filing for the period ${deadline.periodStart.toDateString()} – ${deadline.periodEnd.toDateString()} is due on ${deadline.dueDate.toDateString()}.`,
            recipientAddressByChannel: {
              email: owner.user.email,
              sms: owner.user.phoneNumber ?? undefined,
            },
            relatedDeadlineId: deadline.id,
          });
        } catch (err) {
          // One recipient's enqueue failing (e.g. a transient Redis blip)
          // must not stop every other owner/company in this window from
          // getting their reminder.
          this.logger.error(
            `Failed to enqueue deadline reminder for user ${owner.userId} (deadline ${deadline.id}): ${(err as Error).message}`,
            (err as Error).stack,
          );
        }
      }
    }
  }
}
