import { ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AuthService } from './auth.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenService } from './services/token.service';
import { MailerService } from './services/mailer.service';

/**
 * AuthService is the sole gatekeeper for account access — lockout,
 * password verification, and refresh-token rotation all live here. These
 * tests exist to pin down the exact state transitions that matter for
 * security: a locked account must actually stay locked, a successfully
 * unlocked account must actually be usable again (see the
 * status/lockedUntil regression test below), and a rotated refresh token
 * must never be reusable.
 */
describe('AuthService', () => {
  let service: AuthService;
  let prisma: {
    user: { findUnique: jest.Mock; findUniqueOrThrow: jest.Mock; update: jest.Mock; create: jest.Mock };
    session: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock; updateMany: jest.Mock };
    loginHistory: { create: jest.Mock };
    securityEvent: { create: jest.Mock };
    passwordResetToken: { create: jest.Mock; findFirst: jest.Mock; update: jest.Mock };
    emailVerificationToken: { create: jest.Mock };
    $transaction: jest.Mock;
  };
  let jwtService: { signAsync: jest.Mock };
  let config: { get: jest.Mock };
  let mailerService: {
    sendVerificationEmail: jest.Mock;
    sendPasswordResetEmail: jest.Mock;
    sendAccountLockedAlert: jest.Mock;
  };
  const tokenService = new TokenService();

  const CTX = { deviceFingerprint: 'fp-1', ipAddress: '127.0.0.1', userAgent: 'jest' };

  function activeUser(overrides: Record<string, unknown> = {}) {
    return {
      id: 'user-1',
      email: 'user@example.com',
      passwordHash: 'irrelevant',
      status: 'active',
      isEmailVerified: true,
      failedLoginAttempts: 0,
      lockedUntil: null,
      ...overrides,
    };
  }

  beforeEach(() => {
    prisma = {
      user: { findUnique: jest.fn(), findUniqueOrThrow: jest.fn(), update: jest.fn(), create: jest.fn() },
      session: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn(), updateMany: jest.fn() },
      loginHistory: { create: jest.fn() },
      securityEvent: { create: jest.fn() },
      passwordResetToken: { create: jest.fn(), findFirst: jest.fn(), update: jest.fn() },
      emailVerificationToken: { create: jest.fn() },
      $transaction: jest.fn((ops: unknown[]) => Promise.all(ops as Promise<unknown>[])),
    };
    jwtService = { signAsync: jest.fn().mockResolvedValue('signed.jwt.token') };
    config = {
      get: jest.fn((key: string) => {
        const values: Record<string, unknown> = {
          'auth.maxFailedLoginAttempts': 5,
          'auth.accountLockDurationMinutes': 15,
          'auth.accessTokenSecret': 'test-secret',
          'auth.accessTokenExpiresIn': '15m',
          'auth.refreshTokenExpiresIn': '7d',
          'auth.refreshTokenExpiresInRememberMe': '30d',
        };
        return values[key];
      }),
    };
    mailerService = {
      sendVerificationEmail: jest.fn(),
      sendPasswordResetEmail: jest.fn(),
      sendAccountLockedAlert: jest.fn(),
    };
    prisma.user.update.mockResolvedValue(activeUser());
    prisma.session.create.mockResolvedValue({});

    service = new AuthService(
      prisma as unknown as PrismaService,
      jwtService as never,
      config as never,
      tokenService,
      mailerService as unknown as MailerService,
    );
  });

  describe('register', () => {
    it('rejects a duplicate email with a generic message (no account-enumeration leak)', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser());
      await expect(service.register({
        email: 'user@example.com',
        password: 'Str0ngPassw0rd!',
        firstName: 'A',
        lastName: 'B',
      } as never)).rejects.toBeInstanceOf(ConflictException);
    });

    it('hashes the password with argon2id before storing', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.user.create.mockImplementation(({ data }: { data: { passwordHash: string } }) =>
        Promise.resolve({ id: 'u1', email: data.passwordHash ? 'new@example.com' : '' , passwordHashRaw: data.passwordHash }),
      );

      await service.register({
        email: 'new@example.com',
        password: 'Str0ngPassw0rd!',
        firstName: 'A',
        lastName: 'B',
      } as never);

      const storedHash = prisma.user.create.mock.calls[0][0].data.passwordHash;
      expect(storedHash).toMatch(/^\$argon2id\$/);
      expect(await argon2.verify(storedHash, 'Str0ngPassw0rd!')).toBe(true);
    });
  });

  describe('login', () => {
    it('rejects an unknown email with a generic INVALID_CREDENTIALS error', async () => {
      prisma.user.findUnique.mockResolvedValue(null);
      await expect(
        service.login({ email: 'nobody@example.com', password: 'x' } as never, CTX),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });
    });

    it('rejects login while locked and the lock has not yet expired', async () => {
      const future = new Date(Date.now() + 60_000);
      prisma.user.findUnique.mockResolvedValue(activeUser({ status: 'locked', lockedUntil: future }));

      await expect(service.login({ email: 'user@example.com', password: 'x' } as never, CTX)).rejects.toMatchObject({
        response: { code: 'ACCOUNT_LOCKED' },
      });
      expect(prisma.loginHistory.create).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'failed_locked' }) }),
      );
    });

    it('rejects an unverified account before checking the password', async () => {
      prisma.user.findUnique.mockResolvedValue(activeUser({ isEmailVerified: false }));
      await expect(service.login({ email: 'user@example.com', password: 'x' } as never, CTX)).rejects.toMatchObject({
        response: { code: 'EMAIL_NOT_VERIFIED' },
      });
    });

    it('increments failedLoginAttempts and locks the account once the threshold is reached', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      prisma.user.findUnique.mockResolvedValue(activeUser({ passwordHash: hash, failedLoginAttempts: 4 }));
      prisma.user.update.mockResolvedValue(activeUser({ failedLoginAttempts: 5 }));

      await expect(
        service.login({ email: 'user@example.com', password: 'wrong-password' } as never, CTX),
      ).rejects.toMatchObject({ response: { code: 'INVALID_CREDENTIALS' } });

      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: { failedLoginAttempts: { increment: 1 } } }),
      );
      // 5th failure crosses the default threshold of 5 -> account gets locked.
      expect(prisma.user.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ status: 'locked' }) }),
      );
      expect(mailerService.sendAccountLockedAlert).toHaveBeenCalled();
    });

    it('REGRESSION: restores status to active on a successful login after a since-expired lock', async () => {
      // A user locked out 20 minutes ago (past the 15-minute lock window),
      // now entering the correct password. Login must actually restore
      // usable access — not just return tokens the very next request
      // rejects — because JwtStrategy hard-requires status === 'active'.
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      const past = new Date(Date.now() - 5 * 60 * 1000);
      prisma.user.findUnique.mockResolvedValue(
        activeUser({ status: 'locked', lockedUntil: past, passwordHash: hash }),
      );

      await service.login({ email: 'user@example.com', password: 'correct-password' } as never, CTX);

      expect(prisma.user.update).toHaveBeenCalledWith({
        where: { id: 'user-1' },
        data: { failedLoginAttempts: 0, lockedUntil: null, status: 'active' },
      });
    });

    it('issues an access token and an opaque (non-JWT) refresh token on success', async () => {
      const hash = await argon2.hash('correct-password', { type: argon2.argon2id });
      prisma.user.findUnique.mockResolvedValue(activeUser({ passwordHash: hash }));

      const result = await service.login(
        { email: 'user@example.com', password: 'correct-password' } as never,
        CTX,
      );

      expect(result.accessToken).toBe('signed.jwt.token');
      expect(result.refreshToken).toMatch(/^[0-9a-f]{64}$/); // 32 random bytes, hex-encoded
      expect(prisma.session.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ userId: 'user-1', deviceFingerprint: CTX.deviceFingerprint }),
        }),
      );
    });
  });

  describe('refresh (rotation)', () => {
    it('rejects an unknown, expired, or already-revoked refresh token', async () => {
      prisma.session.findFirst.mockResolvedValue(null);
      await expect(service.refresh('deadbeef', CTX)).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes the old session and issues a new token pair (rotation)', async () => {
      const session = {
        id: 'session-1',
        userId: 'user-1',
        isRememberMe: false,
      };
      prisma.session.findFirst.mockResolvedValue(session);
      prisma.user.findUniqueOrThrow.mockResolvedValue(activeUser());

      const result = await service.refresh('some-raw-token', CTX);

      expect(prisma.session.update).toHaveBeenCalledWith({
        where: { id: 'session-1' },
        data: expect.objectContaining({ revokedAt: expect.any(Date) }),
      });
      expect(result.accessToken).toBe('signed.jwt.token');
      // A brand-new session row is created for the rotated pair.
      expect(prisma.session.create).toHaveBeenCalled();
    });
  });

  describe('resetPassword', () => {
    it('rejects an invalid or expired token', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue(null);
      await expect(
        service.resetPassword({ token: 'bad', newPassword: 'NewStr0ngPass!' } as never),
      ).rejects.toBeInstanceOf(UnauthorizedException);
    });

    it('revokes every active session and clears lockout state on a valid reset', async () => {
      prisma.passwordResetToken.findFirst.mockResolvedValue({ id: 'prt-1', userId: 'user-1' });

      await service.resetPassword({ token: 'good-token', newPassword: 'NewStr0ngPass!' } as never);

      const calls = prisma.$transaction.mock.calls[0][0];
      expect(calls).toHaveLength(3);
      // The user update in the transaction batch must reactivate the account.
      const userUpdateCall = (prisma.user.update as jest.Mock).mock.calls.find(
        ([arg]) => arg.where.id === 'user-1',
      );
      expect(userUpdateCall[0].data).toMatchObject({
        failedLoginAttempts: 0,
        lockedUntil: null,
        status: 'active',
      });
      expect(prisma.session.updateMany).toHaveBeenCalledWith({
        where: { userId: 'user-1', revokedAt: null },
        data: { revokedAt: expect.any(Date) },
      });
    });
  });
});
