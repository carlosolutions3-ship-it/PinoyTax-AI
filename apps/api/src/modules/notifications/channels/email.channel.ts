import { Injectable } from '@nestjs/common';
import * as nodemailer from 'nodemailer';
import { NotificationChannelHandler, NotificationPayload } from '../notification-channel.interface';

@Injectable()
export class EmailChannel implements NotificationChannelHandler {
  readonly channel = 'email' as const;
  private readonly transporter: nodemailer.Transporter;

  constructor() {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
    });
  }

  async send(payload: NotificationPayload): Promise<void> {
    await this.transporter.sendMail({
      from: process.env.SMTP_FROM ?? 'PinoyTax AI <no-reply@pinoytax.ai>',
      to: payload.to,
      subject: payload.title,
      text: payload.body,
    });
  }
}
