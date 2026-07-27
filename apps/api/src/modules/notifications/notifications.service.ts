import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../../common/prisma/prisma.service';
import { EmailChannel } from './channels/email.channel';
import { SmsChannel } from './channels/sms.channel';
import { PushChannel } from './channels/push.channel';
import { InAppChannel } from './channels/in-app.channel';
import { NotificationChannelHandler } from './notification-channel.interface';

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);
  private readonly channels: Record<string, NotificationChannelHandler>;

  constructor(
    private readonly prisma: PrismaService,
    emailChannel: EmailChannel,
    smsChannel: SmsChannel,
    pushChannel: PushChannel,
    inAppChannel: InAppChannel,
  ) {
    this.channels = {
      email: emailChannel,
      sms: smsChannel,
      push: pushChannel,
      in_app: inAppChannel,
    };
  }

  async listForUser(userId: string) {
    return this.prisma.notification.findMany({
      where: { userId },
      orderBy: { scheduledFor: 'desc' },
      take: 100,
    });
  }

  async getPreferences(userId: string) {
    return this.prisma.notificationPreference.findMany({ where: { userId } });
  }

  async setPreference(
    userId: string,
    channel: 'email' | 'sms' | 'push' | 'in_app',
    category: string,
    isEnabled: boolean,
  ) {
    return this.prisma.notificationPreference.upsert({
      where: { userId_channel_category: { userId, channel, category } },
      create: { userId, channel, category, isEnabled },
      update: { isEnabled },
    });
  }

  /**
   * Dispatches a notification across every channel the recipient has enabled
   * for this category, defaulting to enabled when no explicit preference row
   * exists (opt-out, not opt-in, matches most users' expectations for
   * compliance-critical alerts like filing deadlines).
   */
  async dispatch(params: {
    userId: string;
    companyId?: string;
    category: string;
    title: string;
    body: string;
    recipientAddressByChannel: Partial<Record<'email' | 'sms' | 'push', string>>;
    relatedDeadlineId?: string;
  }): Promise<void> {
    const preferences = await this.prisma.notificationPreference.findMany({
      where: { userId: params.userId, category: params.category },
    });
    const disabledChannels = new Set(
      preferences.filter((p) => !p.isEnabled).map((p) => p.channel),
    );

    const channelsToTry: Array<'email' | 'sms' | 'push' | 'in_app'> = [
      'email',
      'sms',
      'push',
      'in_app',
    ];

    for (const channel of channelsToTry) {
      if (disabledChannels.has(channel)) continue;

      const record = await this.prisma.notification.create({
        data: {
          userId: params.userId,
          companyId: params.companyId,
          channel,
          category: params.category,
          title: params.title,
          body: params.body,
          relatedDeadlineId: params.relatedDeadlineId,
          status: 'queued',
          scheduledFor: new Date(),
        },
      });

      try {
        const to =
          channel === 'in_app'
            ? params.userId
            : params.recipientAddressByChannel[channel as 'email' | 'sms' | 'push'];

        if (channel !== 'in_app' && !to) {
          // No address on file for this channel (e.g. user hasn't registered
          // a phone number) — mark failed rather than silently dropping it.
          await this.prisma.notification.update({
            where: { id: record.id },
            data: { status: 'failed' },
          });
          continue;
        }

        await this.channels[channel].send({ to: to!, title: params.title, body: params.body });
        await this.prisma.notification.update({
          where: { id: record.id },
          data: { status: 'sent', sentAt: new Date() },
        });
      } catch (err) {
        this.logger.error(`Failed to dispatch ${channel} notification: ${(err as Error).message}`);
        await this.prisma.notification.update({
          where: { id: record.id },
          data: { status: 'failed' },
        });
      }
    }
  }
}
