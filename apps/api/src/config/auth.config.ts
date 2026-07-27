import { registerAs } from '@nestjs/config';

export default registerAs('auth', () => ({
  accessTokenSecret: process.env.JWT_ACCESS_SECRET,
  accessTokenExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN ?? '15m',
  // Note: refresh tokens are opaque random values (see TokenService), hashed
  // and stored in identity.sessions — they are never signed JWTs, so there
  // is deliberately no "refreshTokenSecret" here.
  refreshTokenExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN ?? '7d',
  refreshTokenExpiresInRememberMe:
    process.env.JWT_REFRESH_EXPIRES_IN_REMEMBER_ME ?? '30d',
  maxFailedLoginAttempts: Number(process.env.MAX_FAILED_LOGIN_ATTEMPTS ?? 5),
  accountLockDurationMinutes: Number(
    process.env.ACCOUNT_LOCK_DURATION_MINUTES ?? 15,
  ),
  appWebUrl: process.env.APP_WEB_URL ?? 'http://localhost:3000',
}));
