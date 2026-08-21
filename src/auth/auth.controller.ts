import {
  Body,
  Controller,
  Get,
  HttpCode,
  Patch,
  Post,
  Query,
  Req,
  Res,
  UseGuards,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Request, Response } from 'express';
import { resolveAppUrl } from '../common/app-url.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { AuthService } from './auth.service.js';
import { GoogleOAuthGuard } from './guards/google-oauth.guard.js';
import type { GoogleProfile } from './strategies/google.strategy.js';
import { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import { LoginDto } from './dto/login.dto.js';
import { RegisterDto } from './dto/register.dto.js';
import { ResetPasswordDto } from './dto/reset-password.dto.js';
import { SendVerificationCodeDto, VerifyCodeDto } from './dto/verify-code.dto.js';
import { UpdateProfileDto } from './dto/update-profile.dto.js';

/**
 * The role chosen before the redirect, carried in OAuth `state`.
 *
 * Anything unrecognised falls back to INVESTOR rather than throwing: `state`
 * is round-tripped through a third party and a malformed value should not cost
 * the user their sign-in. Only these two are ever accepted, so a tampered
 * value cannot mint a developer or agent account.
 */
function parseOAuthRole(state: string): 'INVESTOR' | 'TENANT' {
  return state.toUpperCase() === 'TENANT' ? 'TENANT' : 'INVESTOR';
}

@ApiTags('Auth')
@Controller('auth')
export class AuthController {
  constructor(
    private readonly authService: AuthService,
    private readonly config: ConfigService,
  ) {}

  @Public()
  @Post('register')
  @ApiOperation({ summary: 'Register a new account (Developer / Investor / Tenant)' })
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  @ApiOperation({ summary: 'Login with email + password' })
  login(
    @Body() dto: LoginDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.login(dto, res);
  }

  /**
   * Starts the Google flow. `role` is the account type chosen on the register
   * screen; it is passed through OAuth `state` and only applied when creating a
   * new account. Anything other than INVESTOR or TENANT is treated as INVESTOR
   * — developer and agent accounts need verification this flow cannot collect.
   */
  @Public()
  @Get('google')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Start Google sign-in (Investor / Tenant)' })
  googleAuth(): void {
    // The guard issues the redirect to Google; nothing runs here.
  }

  @Public()
  @Get('google/callback')
  @UseGuards(GoogleOAuthGuard)
  @ApiOperation({ summary: 'Google OAuth callback — redirects back to the app' })
  async googleCallback(
    @Req() req: Request,
    @Res() res: Response,
  ): Promise<void> {
    const appUrl = resolveAppUrl(this.config);

    try {
      const profile = req.user as GoogleProfile | undefined;
      if (!profile) throw new Error('No profile returned from Google');

      const role = parseOAuthRole((req.query.state as string) ?? '');
      const { accessToken } = await this.authService.googleSignIn(profile, role, res);

      // The access token goes back in the URL fragment, not the query string:
      // a fragment is never sent to the server and stays out of access logs,
      // Referer headers and the browser history entry the server sees. The
      // refresh token is already set as an httpOnly cookie by googleSignIn.
      res.redirect(`${appUrl}/google/complete#access_token=${encodeURIComponent(accessToken)}`);
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Google sign-in failed';
      res.redirect(`${appUrl}/login?error=${encodeURIComponent(message)}`);
    }
  }

  @Post('logout')
  @HttpCode(200)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Logout and invalidate refresh token' })
  logout(
    @CurrentUser() user: { id: string },
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.logout(user.id, res);
  }

  @Public()
  @Post('refresh')
  @HttpCode(200)
  @ApiOperation({ summary: 'Rotate refresh token and get a new access token' })
  refresh(
    @Req() req: Request,
    @Res({ passthrough: true }) res: Response,
  ) {
    const cookie = (req.cookies as Record<string, string>)['refresh_token'];
    if (!cookie) {
      return { message: 'No refresh token' };
    }
    return this.authService.refresh(cookie, res);
  }

  @Public()
  @Get('verify-email')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email address with token from email link' })
  verifyEmail(@Query('token') token: string) {
    return this.authService.verifyEmail(token);
  }

  @Public()
  @Post('send-verification-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Send a 6-digit email verification code' })
  sendVerificationCode(@Body() dto: SendVerificationCodeDto) {
    return this.authService.sendVerificationCode(dto.email);
  }

  @Public()
  @Post('verify-code')
  @HttpCode(200)
  @ApiOperation({ summary: 'Verify email address with a 6-digit code' })
  verifyCode(@Body() dto: VerifyCodeDto) {
    return this.authService.verifyCode(dto.email, dto.code);
  }

  @Public()
  @Post('forgot-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Request a password reset email' })
  forgotPassword(@Body() dto: ForgotPasswordDto) {
    return this.authService.forgotPassword(dto);
  }

  @Public()
  @Post('reset-password')
  @HttpCode(200)
  @ApiOperation({ summary: 'Reset password using token from email' })
  resetPassword(
    @Body() dto: ResetPasswordDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.authService.resetPassword(dto, res);
  }

  @Get('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Get current authenticated user profile' })
  getMe(@CurrentUser() user: { id: string }) {
    return this.authService.getMe(user.id);
  }

  @Patch('me')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Update current user profile' })
  updateMe(
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateMe(user.id, dto);
  }
}
