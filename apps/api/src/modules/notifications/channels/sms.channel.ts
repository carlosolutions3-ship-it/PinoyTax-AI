import { Injectable, Logger } from '@nestjs/common';
import { NotificationChannelHandler, NotificationPayload } from '../notification-channel.interface';

/**
 * Provider-agnostic SMS channel. Wire the actual HTTP call to your chosen
 * PH-focused SMS gateway (e.g. Semaphore, Movider, Twilio) here — the rest
 * of the Notifications module only depends on this interface, so swapping
 * providers never touches calendar/reminder logic (Phase 3 §4.1, Phase 4
 * open item #3).
 */
@Injectable()
export class SmsChannel implements NotificationChannelHandler {
  readonly channel = 'sms' as const;
  private readonly logger = new Logger(SmsChannel.name);
  private readonly apiKey = process.env.SMS_GATEWAY_API_KEY;
  private readonly apiUrl = process.env.SMS_GATEWAY_URL;

  async send(payload: NotificationPayload): Promise<void> {
    if (!this.apiKey || !this.apiUrl) {
      this.logger.warn(
        `SMS gateway not configured — skipping SMS to ${payload.to}: ${payload.title}`,
      );
      return;
    }

    const response = await fetch(this.apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${this.apiKey}` },
      body: JSON.stringify({
        to: payload.to,
        message: `${payload.title}: ${payload.body}`,
      }),
    });

    if (!response.ok) {
      const text = await response.text();
      throw new Error(`SMS gateway responded with ${response.status}: ${text}`);
    }
  }
}
