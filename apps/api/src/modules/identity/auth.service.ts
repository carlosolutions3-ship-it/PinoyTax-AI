import {
  ConflictException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import * as argon2 from 'argon2';
import { PrismaService } from '../../common/prisma/prisma.service';
import { TokenService } from './services/token.service';
import { MailerService } from './services/mailer.service';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

interface LoginContext {
  ipAddress?: string;
  userAgent?: string;
  deviceFingerprint: string;
  deviceName?: string;
}

interface TokenPair {
  accessToken: string;
  refreshToken: string;
}

const EMAIL_VERIFICATION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const PASSWORD_RESET_TTL_MS = 60 * 60 * 1000; // 1 hour

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwtService: JwtService,
    private readonly config: ConfigService,
    private readonly tokenService: TokenService,
    private readonly mailerService: MailerService,
  ) {}

  async register(dto: RegisterDto) {
    const existing = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });
    if (existing) {
      // Deliberately generic message — do not reveal whether the email is
      // registered to an unauthenticated caller (avoids account enumeration).
      throw new ConflictException({
        code: 'REGISTRATION_FAILED',
        message: 'Unable to complete registration with the provided details.',
      });
    }

    const passwordHash = await argon2.hash(dto.password, { type: argon2.argon2id });

    const user = await this.prisma.user.create({
      data: {
        email: dto.email.toLowerCase(),
        passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phoneNumber: dto.phoneNumber,
      },
    });

    await this.issueEmailVerification(user.id, user.email);

    return { id: user.id, email: user.email };
  }

  async issueEmailVerification(userId: string, email: string): Promise<void> {
    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);

    await this.prisma.emailVerificationToken.create({
      data: {
        userId,
        tokenHash,
        expiresAt: new Date(Date.now() + EMAIL_VERIFICATION_TTL_MS),
      },
    });

    await this.mailerService.sendVerificationEmail(email, rawToken);
  }

  async verifyEmail(dto: VerifyEmailDto): Promise<void> {
    const tokenHash = this.tokenService.hashToken(dto.token);
    const record = await this.prisma.emailVerificationToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!record) {
      throw new UnauthorizedException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This verification link is invalid or has expired.',
      });
    }

    await this.prisma.$transaction([
      this.prisma.emailVerificationToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { isEmailVerified: true },
      }),
    ]);
  }

  async login(dto: LoginDto, ctx: LoginContext): Promise<TokenPair & { user: { id: string; email: string } }> {
    const user = await this.prisma.user.findUnique({
      where: { email: dto.email.toLowerCase() },
    });

    // Constant-shape handling whether or not the user exists, to avoid
    // leaking account existence through timing/response differences where
    // practical. We still need `user` below, so we branch, but every branch
    // funnels to the same generic UnauthorizedException.
    if (!user) {
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    if (user.status === 'locked' && user.lockedUntil && user.lockedUntil > new Date()) {
      await this.recordLoginAttempt(user.id, 'failed_locked', ctx);
      throw new UnauthorizedException({
        code: 'ACCOUNT_LOCKED',
        message: `Your account is temporarily locked. Please try again after ${user.lockedUntil.toISOString()}.`,
      });
    }

    if (!user.isEmailVerified) {
      await this.recordLoginAttempt(user.id, 'failed_unverified', ctx);
      throw new UnauthorizedException({
        code: 'EMAIL_NOT_VERIFIED',
        message: 'Please verify your email address before logging in.',
      });
    }

    const passwordValid =
      user.passwordHash != null && (await argon2.verify(user.passwordHash, dto.password));

    if (!passwordValid) {
      await this.handleFailedLogin(user.id, ctx);
      throw new UnauthorizedException({
        code: 'INVALID_CREDENTIALS',
        message: 'Incorrect email or password.',
      });
    }

    // Successful login: reset failed-attempt counter and record session.
    await this.prisma.user.update({
      where: { id: user.id },
      data: { failedLoginAttempts: 0, lockedUntil: null },
    });
    await this.recordLoginAttempt(user.id, 'success', ctx);

    const tokens = await this.issueTokenPair(user.id, user.email, ctx, dto.rememberMe ?? false);

    return { ...tokens, user: { id: user.id, email: user.email } };
  }

  private async handleFailedLogin(userId: string, ctx: LoginContext): Promise<void> {
    const maxAttempts = this.config.get<number>('auth.maxFailedLoginAttempts') ?? 5;
    const lockMinutes = this.config.get<number>('auth.accountLockDurationMinutes') ?? 15;

    const user = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginAttempts: { increment: 1 } },
    });

    await this.recordLoginAttempt(userId, 'failed_password', ctx);

    if (user.failedLoginAttempts >= maxAttempts) {
      const lockedUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: 'locked', lockedUntil },
      });
      await this.prisma.securityEvent.create({
        data: { userId, eventType: 'account_locked', details: { lockedUntil } },
      });
      await this.mailerService.sendAccountLockedAlert(user.email);
    }
  }

  private async recordLoginAttempt(
    userId: string,
    status: 'success' | 'failed_password' | 'failed_locked' | 'failed_unverified',
    ctx: LoginContext,
  ): Promise<void> {
    await this.prisma.loginHistory.create({
      data: {
        userId,
        status,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
      },
    });
  }

  private async issueTokenPair(
    userId: string,
    email: string,
    ctx: LoginContext,
    rememberMe: boolean,
  ): Promise<TokenPair> {
    const accessToken = await this.jwtService.signAsync(
      { sub: userId, email },
      {
        secret: this.config.get<string>('auth.accessTokenSecret'),
        expiresIn: this.config.get<string>('auth.accessTokenExpiresIn'),
      },
    );

    const rawRefreshToken = this.tokenService.generateRawToken();
    const refreshTokenHash = this.tokenService.hashToken(rawRefreshToken);

    const expiresInConfig = rememberMe
      ? this.config.get<string>('auth.refreshTokenExpiresInRememberMe')
      : this.config.get<string>('auth.refreshTokenExpiresIn');

    const expiresAt = new Date(Date.now() + this.parseDurationMs(expiresInConfig ?? '7d'));

    await this.prisma.session.create({
      data: {
        userId,
        refreshTokenHash,
        deviceFingerprint: ctx.deviceFingerprint,
        deviceName: ctx.deviceName,
        ipAddress: ctx.ipAddress,
        userAgent: ctx.userAgent,
        isRememberMe: rememberMe,
        expiresAt,
      },
    });

    return { accessToken, refreshToken: rawRefreshToken };
  }

  async refresh(rawRefreshToken: string, ctx: LoginContext): Promise<TokenPair> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    const session = await this.prisma.session.findFirst({
      where: {
        refreshTokenHash: tokenHash,
        revokedAt: null,
        expiresAt: { gt: new Date() },
      },
    });

    if (!session) {
      throw new UnauthorizedException({
        code: 'INVALID_REFRESH_TOKEN',
        message: 'Your session has expired. Please log in again.',
      });
    }

    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: session.userId } });

    // Rotate: revoke the old refresh token and issue a new one, so a stolen
    // refresh token can only ever be replayed once before detection.
    await this.prisma.session.update({
      where: { id: session.id },
      data: { revokedAt: new Date(), lastActiveAt: new Date() },
    });

    return this.issueTokenPair(user.id, user.email, ctx, session.isRememberMe);
  }

  async logout(rawRefreshToken: string): Promise<void> {
    const tokenHash = this.tokenService.hashToken(rawRefreshToken);
    await this.prisma.session.updateMany({
      where: { refreshTokenHash: tokenHash, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async revokeSession(userId: string, sessionId: string): Promise<void> {
    await this.prisma.session.updateMany({
      where: { id: sessionId, userId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
  }

  async listSessions(userId: string) {
    return this.prisma.session.findMany({
      where: { userId, revokedAt: null },
      orderBy: { lastActiveAt: 'desc' },
      select: {
        id: true,
        deviceName: true,
        ipAddress: true,
        userAgent: true,
        isRememberMe: true,
        lastActiveAt: true,
        createdAt: true,
      },
    });
  }

  async forgotPassword(dto: ForgotPasswordDto): Promise<void> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email.toLowerCase() } });
    // Always respond as if successful, whether or not the account exists,
    // to avoid leaking account existence to an unauthenticated caller.
    if (!user) return;

    const rawToken = this.tokenService.generateRawToken();
    const tokenHash = this.tokenService.hashToken(rawToken);

    await this.prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt: new Date(Date.now() + PASSWORD_RESET_TTL_MS),
      },
    });

    await this.mailerService.sendPasswordResetEmail(user.email, rawToken);
  }

  async resetPassword(dto: ResetPasswordDto): Promise<void> {
    const tokenHash = this.tokenService.hashToken(dto.token);
    const record = await this.prisma.passwordResetToken.findFirst({
      where: { tokenHash, usedAt: null, expiresAt: { gt: new Date() } },
    });

    if (!record) {
      throw new UnauthorizedException({
        code: 'INVALID_OR_EXPIRED_TOKEN',
        message: 'This password reset link is invalid or has expired.',
      });
    }

    const newHash = await argon2.hash(dto.newPassword, { type: argon2.argon2id });

    await this.prisma.$transaction([
      this.prisma.passwordResetToken.update({
        where: { id: record.id },
        data: { usedAt: new Date() },
      }),
      this.prisma.user.update({
        where: { id: record.userId },
        data: { passwordHash: newHash, failedLoginAttempts: 0, lockedUntil: null, status: 'active' },
      }),
      // Resetting the password invalidates every existing session — a
      // credential compromise recovery shouldn't leave old sessions alive.
      this.prisma.session.updateMany({
        where: { userId: record.userId, revokedAt: null },
        data: { revokedAt: new Date() },
      }),
    ]);
  }

  async getProfile(userId: string) {
    const user = await this.prisma.user.findUniqueOrThrow({ where: { id: userId } });
    return {
      id: user.id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phoneNumber: user.phoneNumber,
      isEmailVerified: user.isEmailVerified,
      isPlatformAdmin: user.isPlatformAdmin,
      createdAt: user.createdAt,
    };
  }

  private parseDurationMs(duration: string): number {
    const match = /^(\d+)([smhd])$/.exec(duration);
    if (!match) return 7 * 24 * 60 * 60 * 1000; // default 7 days
    const value = Number(match[1]);
    const unit = match[2];
    const unitMs: Record<string, number> = {
      s: 1000,
      m: 60 * 1000,
      h: 60 * 60 * 1000,
      d: 24 * 60 * 60 * 1000,
    };
    return value * unitMs[unit];
  }
}
