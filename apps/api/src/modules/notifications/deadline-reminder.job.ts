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

    await this.updateDeadlineStatuses(today);
    await this.sendUpcomingReminders(today);
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
      const targetDate = new Date(today.getTime() + daysBefore * 24 * 60 * 60 * 1000);
      const nextDay = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000);

      const deadlines = await this.prisma.filingDeadline.findMany({
        where: {
          dueDate: { gte: targetDate, lt: nextDay },
          status: { in: ['upcoming', 'due_today'] },
        },
      });

      for (const deadline of deadlines) {
        const owners = await this.prisma.userCompanyRole.findMany({
          where: { companyId: deadline.companyId, status: 'active' },
          include: { user: true },
        });

        for (const owner of owners) {
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
        }
      }
    }
  }
}
