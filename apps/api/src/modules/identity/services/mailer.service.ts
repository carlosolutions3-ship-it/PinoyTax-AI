import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailerService {
  private readonly logger = new Logger(MailerService.name);
  private readonly transporter: nodemailer.Transporter;

  constructor(private readonly config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST,
      port: Number(process.env.SMTP_PORT ?? 587),
      auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS,
      },
      // Without these, nodemailer falls back to Node's default socket
      // timeout (multiple minutes) when the SMTP host is slow, unreachable,
      // or filtered — and every call site here fires the send without
      // awaiting it specifically because that would otherwise block
      // registration/login/password-reset for that same multi-minute
      // window. Bound it explicitly so an SMTP outage degrades to "the
      // email is just late" instead of "the API stalls."
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 10_000,
    });
  }

  async sendVerificationEmail(to: string, rawToken: string): Promise<void> {
    const webUrl = this.config.get<string>('auth.appWebUrl');
    const link = `${webUrl}/verify-email?token=${rawToken}`;
    await this.send(
      to,
      'Verify your PinoyTax AI account',
      `Welcome to PinoyTax AI! Please verify your email by visiting: ${link}\n\nThis link expires in 24 hours.`,
    );
  }

  async sendPasswordResetEmail(to: string, rawToken: string): Promise<void> {
    const webUrl = this.config.get<string>('auth.appWebUrl');
    const link = `${webUrl}/reset-password?token=${rawToken}`;
    await this.send(
      to,
      'Reset your PinoyTax AI password',
      `We received a request to reset your password. Visit: ${link}\n\nIf you didn't request this, you can safely ignore this email. This link expires in 1 hour.`,
    );
  }

  async sendAccountLockedAlert(to: string): Promise<void> {
    await this.send(
      to,
      'Your PinoyTax AI account was temporarily locked',
      'We locked your account temporarily after several failed login attempts. If this wasn\'t you, please reset your password once the lock expires.',
    );
  }

  private async send(to: string, subject: string, text: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: process.env.SMTP_FROM ?? 'PinoyTax AI <no-reply@pinoytax.ai>',
        to,
        subject,
        text,
      });
    } catch (err) {
      // Email delivery failures must never crash the request (e.g. registration
      // should still succeed even if the verification email fails to send —
      // the user can request a resend). We log loudly instead.
      this.logger.error(`Failed to send email to ${to}: ${(err as Error).message}`);
    }
  }
}
