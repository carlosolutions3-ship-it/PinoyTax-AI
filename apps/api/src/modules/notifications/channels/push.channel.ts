import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannelHandler, NotificationPayload } from '../notification-channel.interface';

/**
 * Push channel targeting Firebase Cloud Messaging. `payload.to` is expected
 * to be the recipient's FCM device token, resolved by the caller from the
 * user's registered devices before invoking this channel.
 */
@Injectable()
export class PushChannel implements NotificationChannelHandler {
  readonly channel = 'push' as const;
  private readonly logger = new Logger(PushChannel.name);
  private readonly serverKey = process.env.FCM_SERVER_KEY;

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.serverKey) {
      this.logger.warn(`FCM not configured — skipping push to ${payload.to}: ${payload.title}`);
      return;
    }

    const response = await fetch('https://fcm.googleapis.com/fcm/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `key=${this.serverKey}`,
      },
      body: JSON.stringify({
        to: payload.to,
        notification: { title: payload.title, body: payload.body },
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`FCM responded with ${response.status}: ${text}`);
    }
  }
}
