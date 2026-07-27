import { randomBytes, createHash } from 'crypto';
import { Injectable } from '@nestjs/common';

@Injectable()
export class TokenService {
  /**
   * Generates a cryptographically random, URL-safe token to send to the user
   * (e.g. in an email verification or password reset link). Only the HASH of
   * this value is ever persisted — the raw token exists only in the outbound
   * email/link and the requester's browser, never in our database.
   */
  generateRawToken(): string {
    return randomBytes(32).toString('hex');
  }

  hashToken(rawToken: string): string {
    return createHash('sha256').update(rawToken).digest('hex');
  }
}
