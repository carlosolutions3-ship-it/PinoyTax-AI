import { Injectable } from '@nestjs/common';
import { NotificationChannelHandler, NotificationPayload } from '../notification-channel.interface';

/**
 * In-app notifications don't "send" anywhere external — the row already
 * created in notifications.notifications by NotificationsService IS the
 * delivery. This handler exists purely so the channel-dispatch loop in
 * NotificationsService can treat all four channels uniformly.
 */
@Injectable()
export class InAppChannel implements NotificationChannelHandler {
  readonly channel = 'in_app' as const;

  async send(_payload: NotificationPayload): Promise<void> {
    // No-op by design — see class doc comment above.
    return;
  }
}
