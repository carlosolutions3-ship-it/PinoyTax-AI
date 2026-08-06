import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Req,
  Res,
} from '@nestjs/common';
import { CookieOptions, Request, Response } from 'express';
import { Throttle } from '@nestjs/throttler';
import { ApiTags } from '@nestjs/swagger';
import { AuthService } from './auth.service';
import { Public } from '../../common/decorators/public.decorator';
import { CurrentUser, AuthenticatedUser } from '../../common/decorators/current-user.decorator';
import {
  ForgotPasswordDto,
  LoginDto,
  RegisterDto,
  ResetPasswordDto,
  VerifyEmailDto,
} from './dto/auth.dto';

const REFRESH_COOKIE = 'pinoytax_refresh_token';

// SameSite=Strict only works when the frontend and API are same-site (e.g.
// localhost:3000/3001 in dev, which differ only by port). This project's
// documented production deployment (apps/web and apps/api as separate
// Railway services — see DEPLOYMENT.md §5) puts them on different
// `*.up.railway.app` subdomains; that wildcard domain is on the Public
// Suffix List (like vercel.app/herokuapp.com — every tenant's subdomain is
// treated as its own site, specifically to stop cross-tenant cookie
// leakage), so this is genuinely cross-site despite sharing a parent
// domain — Strict (and Lax, for non-navigation requests like fetch)
// cookies are never sent there, silently breaking the refresh flow.
// SameSite=None is required for cross-site cookies, which itself requires
// Secure=true — already true whenever NODE_ENV=production.
const isProduction = process.env.NODE_ENV === 'production';
const REFRESH_COOKIE_BASE_OPTIONS: CookieOptions = {
  httpOnly: true,
  secure: isProduction,
  sameSite: isProduction ? 'none' : 'strict',
  path: '/v1/auth',
};

@ApiTags('auth')
@Controller('auth')
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('register')
  async register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } })
  @Post('verify-email')
  @HttpCode(HttpStatus.OK)
  async verifyEmail(@Body() dto: VerifyEmailDto) {
    await this.authService.verifyEmail(dto);
    return { message: 'Email verified successfully.' };
  }

  @Public()
  @Throttle({ default: { limit: 10, ttl: 60_000 } }) // strict per Phase 1 §5/rate-limiting
  @Post('login')
  @HttpCode(HttpStatus.OK)
  async login(
    @Body() dto: LoginDto,
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const result = await this.authService.login(dto, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceFingerprint: this.buildDeviceFingerprint(req),
      deviceName: req.headers['user-agent'],
    });

    this.setRefreshCookie(res, result.refreshToken, dto.rememberMe ?? false);

    return { accessToken: result.accessToken, user: result.user };
  }

  @Public()
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('refresh')
  @HttpCode(HttpStatus.OK)
  async refresh(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (!refreshToken) {
      return { accessToken: null };
    }

    const result = await this.authService.refresh(refreshToken, {
      ipAddress: req.ip,
      userAgent: req.headers['user-agent'],
      deviceFingerprint: this.buildDeviceFingerprint(req),
    });

    this.setRefreshCookie(res, result.refreshToken, true);
    return { accessToken: result.accessToken };
  }

  @Public()
  @Post('logout')
  @HttpCode(HttpStatus.OK)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const refreshToken = req.cookies?.[REFRESH_COOKIE];
    if (refreshToken) {
      await this.authService.logout(refreshToken);
    }
    res.clearCookie(REFRESH_COOKIE, REFRESH_COOKIE_BASE_OPTIONS);
    return { message: 'Logged out.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('forgot-password')
  @HttpCode(HttpStatus.OK)
  async forgotPassword(@Body() dto: ForgotPasswordDto) {
    await this.authService.forgotPassword(dto);
    // Always the same response, whether or not the account exists.
    return { message: 'If an account exists for that email, a reset link has been sent.' };
  }

  @Public()
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('reset-password')
  @HttpCode(HttpStatus.OK)
  async resetPassword(@Body() dto: ResetPasswordDto) {
    await this.authService.resetPassword(dto);
    return { message: 'Password reset successfully. Please log in again.' };
  }

  @Get('sessions')
  async listSessions(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.listSessions(user.id);
  }

  @Delete('sessions/:sessionId')
  async revokeSession(
    @CurrentUser() user: AuthenticatedUser,
    @Param('sessionId') sessionId: string,
  ) {
    await this.authService.revokeSession(user.id, sessionId);
    return { message: 'Session revoked.' };
  }

  private setRefreshCookie(res: Response, token: string, rememberMe: boolean): void {
    res.cookie(REFRESH_COOKIE, token, {
      ...REFRESH_COOKIE_BASE_OPTIONS,
      maxAge: rememberMe ? 30 * 24 * 60 * 60 * 1000 : 7 * 24 * 60 * 60 * 1000,
    });
  }

  private buildDeviceFingerprint(req: Request): string {
    // Lightweight fingerprint from stable request headers. Not meant to be
    // forensically unique — just enough to distinguish devices for the
    // "Device History" feature and session list UX.
    return Buffer.from(`${req.headers['user-agent'] ?? ''}|${req.ip ?? ''}`).toString(
      'base64',
    );
  }
}
