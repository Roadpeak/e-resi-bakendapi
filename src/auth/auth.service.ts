import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { User } from '@prisma/client';
import * as bcrypt from 'bcryptjs';
import { createHash, randomBytes, randomInt } from 'crypto';
import type { Response } from 'express';
import { MailService } from '../mail/mail.service.js';
import { PrismaService } from '../prisma/prisma.service.js';
import type { ForgotPasswordDto } from './dto/forgot-password.dto.js';
import type { LoginDto } from './dto/login.dto.js';
import type { RegisterDto } from './dto/register.dto.js';
import type { ResetPasswordDto } from './dto/reset-password.dto.js';
import type { UpdateProfileDto } from './dto/update-profile.dto.js';

type SafeUser = Omit<
  User,
  'password' | 'refreshToken' | 'emailVerifyToken' | 'passwordResetToken' | 'passwordResetExpiry'
>;

@Injectable()
export class AuthService {
  private readonly isProd: boolean;

  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    private readonly mail: MailService,
  ) {
    this.isProd = config.get<string>('NODE_ENV') === 'production';
  }

  // ─── Helpers ────────────────────────────────────────────────────────────────

  private sha256(value: string): string {
    return createHash('sha256').update(value).digest('hex');
  }

  private generateToken(): string {
    return randomBytes(32).toString('hex');
  }

  private sanitize(user: User): SafeUser {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
    return safe;
  }

  private buildRefreshCookieValue(userId: string, rawToken: string): string {
    return `${userId}.${rawToken}`;
  }

  private setRefreshCookie(res: Response, userId: string, rawToken: string): void {
    res.cookie('refresh_token', this.buildRefreshCookieValue(userId, rawToken), {
      httpOnly: true,
      sameSite: 'strict',
      secure: this.isProd,
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      path: '/',
    });
  }

  private clearRefreshCookie(res: Response): void {
    res.clearCookie('refresh_token', { httpOnly: true, sameSite: 'strict', path: '/' });
  }

  private signAccess(user: User): string {
    return this.jwt.sign(
      { sub: user.id, email: user.email, role: user.role },
      { expiresIn: '15m' },
    );
  }

  // ─── Register ───────────────────────────────────────────────────────────────

  async register(dto: RegisterDto): Promise<{ message: string }> {
    const existing = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (existing) throw new ConflictException('Email already registered');

    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({ where: { phone: dto.phone } });
      if (phoneTaken) throw new ConflictException('Phone number already registered');
    }

    if (dto.role === 'DEVELOPER' && !dto.companyName) {
      throw new BadRequestException('companyName is required for Developer accounts');
    }

    if (dto.role === 'AGENT') {
      if (!dto.agentKind) {
        throw new BadRequestException('agentKind is required for Agent accounts');
      }
      if (!dto.displayName?.trim()) {
        throw new BadRequestException('displayName is required for Agent accounts');
      }
      // Without a specialty an agent matches no search and appears nowhere,
      // so an account created without one would be silently useless.
      if (!dto.specialties?.length) {
        throw new BadRequestException('Select at least one specialty for Agent accounts');
      }
    }

    const passwordHash = await bcrypt.hash(dto.password, 12);

    const user = await this.prisma.user.create({
      data: {
        email: dto.email,
        password: passwordHash,
        firstName: dto.firstName,
        lastName: dto.lastName,
        phone: dto.phone,
        role: dto.role,
      },
    });

    if (dto.role === 'DEVELOPER') {
      await this.prisma.developerProfile.create({
        data: { userId: user.id, companyName: dto.companyName! },
      });
    }

    if (dto.role === 'AGENT') {
      await this.prisma.agentProfile.create({
        data: {
          userId: user.id,
          kind: dto.agentKind!,
          displayName: dto.displayName!.trim(),
          specialties: dto.specialties!,
          phone: dto.phone,
          email: dto.email,
          // Nothing is public until KYC is approved and the fee is current —
          // isListed defaults to false and is set by those two, not signup.
        },
      });
    }

    // Signup verifies with a one-time code, which the client requests straight
    // after registering. Sending the link email here as well produced two
    // emails per signup for a flow that only ever uses the code.
    await this.sendVerificationCode(user.email);

    return { message: 'Registration successful. Check your email for the verification code.' };
  }

  // ─── Login ──────────────────────────────────────────────────────────────────

  async login(dto: LoginDto, res: Response): Promise<{ accessToken: string; user: SafeUser }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });
    if (!user || !user.password) throw new UnauthorizedException('Invalid credentials');

    const valid = await bcrypt.compare(dto.password, user.password);
    if (!valid) throw new UnauthorizedException('Invalid credentials');

    if (!user.isActive) throw new ForbiddenException('Account is disabled');

    // Carries a machine-readable code so the client can open the OTP step
    // instead of showing a dead-end error. Accounts created while mail was
    // down never got their code, and a plain message left them stuck with no
    // way to ask for another.
    if (!user.emailVerified) {
      throw new ForbiddenException({
        statusCode: 403,
        error: 'EMAIL_NOT_VERIFIED',
        message: 'Verify your email to continue',
        email: user.email,
      });
    }

    const rawRefresh = this.generateToken();
    const hashedRefresh = this.sha256(rawRefresh);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefresh, lastLoginAt: new Date() },
    });

    this.setRefreshCookie(res, user.id, rawRefresh);

    return { accessToken: this.signAccess(user), user: this.sanitize(user) };
  }

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  /**
   * Sign in, or create an account, from a verified Google profile.
   *
   * `role` is the one chosen on the register screen and carried through the
   * OAuth round-trip. It is only honoured when creating a new account — an
   * existing user keeps whatever role they already have, so this endpoint can
   * never be used to change one.
   *
   * Only INVESTOR and TENANT are accepted. Developer and agent accounts need
   * KYB/KYC, company details and document uploads that a one-click flow would
   * skip, leaving an account that looks complete but cannot list anything.
   */
  async googleSignIn(
    profile: {
      googleId: string;
      email: string;
      firstName: string;
      lastName: string;
      avatarUrl?: string;
      emailVerified: boolean;
    },
    role: 'INVESTOR' | 'TENANT',
    res: Response,
  ): Promise<{ accessToken: string; user: SafeUser }> {
    let user = await this.prisma.user.findUnique({ where: { email: profile.email } });

    if (user) {
      if (!user.isActive) throw new ForbiddenException('Account is disabled');

      // An account that signed up with a password can also use Google, as long
      // as Google vouches for the same address. Link the provider on first use
      // rather than refusing, which would strand the user with two ways in and
      // only one that works.
      const patch: Record<string, unknown> = { lastLoginAt: new Date() };
      if (!user.oauthProvider) {
        patch.oauthProvider = 'google';
        patch.oauthId = profile.googleId;
      }
      // Google has already proved the address. Honouring that clears the
      // email-verification wall for accounts that never completed our own code
      // step — they would otherwise be locked out despite a valid sign-in.
      if (!user.emailVerified && profile.emailVerified) {
        patch.emailVerified = true;
      }
      if (!user.avatarUrl && profile.avatarUrl) {
        patch.avatarUrl = profile.avatarUrl;
      }

      user = await this.prisma.user.update({ where: { id: user.id }, data: patch });
    } else {
      user = await this.prisma.user.create({
        data: {
          email: profile.email,
          // No password: the column is nullable precisely so an OAuth account
          // has no credential to guess. login() already rejects users without
          // one, so this cannot be used to bypass the password check.
          password: null,
          firstName: profile.firstName,
          lastName: profile.lastName || profile.firstName,
          avatarUrl: profile.avatarUrl,
          role,
          oauthProvider: 'google',
          oauthId: profile.googleId,
          // Trust Google's verification; otherwise a brand-new Google account
          // would be bounced to an email-code step it can never satisfy.
          emailVerified: profile.emailVerified,
          lastLoginAt: new Date(),
        },
      });
    }

    const rawRefresh = this.generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: this.sha256(rawRefresh) },
    });
    this.setRefreshCookie(res, user.id, rawRefresh);

    return { accessToken: this.signAccess(user), user: this.sanitize(user) };
  }

  // ─── Logout ─────────────────────────────────────────────────────────────────

  async logout(userId: string, res: Response): Promise<{ message: string }> {
    await this.prisma.user.update({ where: { id: userId }, data: { refreshToken: null } });
    this.clearRefreshCookie(res);
    return { message: 'Logged out successfully' };
  }

  // ─── Refresh ─────────────────────────────────────────────────────────────────

  async refresh(cookieValue: string, res: Response): Promise<{ accessToken: string }> {
    const dotIndex = cookieValue.indexOf('.');
    if (dotIndex === -1) throw new UnauthorizedException('Invalid refresh token');

    const userId = cookieValue.slice(0, dotIndex);
    const rawToken = cookieValue.slice(dotIndex + 1);

    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.refreshToken) throw new UnauthorizedException('Invalid refresh token');
    if (!user.isActive) throw new ForbiddenException('Account is disabled');

    const tokenHash = this.sha256(rawToken);
    if (tokenHash !== user.refreshToken) throw new UnauthorizedException('Invalid refresh token');

    // Rotate
    const newRaw = this.generateToken();
    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: this.sha256(newRaw) },
    });
    this.setRefreshCookie(res, user.id, newRaw);

    return { accessToken: this.signAccess(user) };
  }

  // ─── Verify Email ────────────────────────────────────────────────────────────

  async verifyEmail(token: string): Promise<{ message: string }> {
    const hashed = this.sha256(token);
    const user = await this.prisma.user.findFirst({ where: { emailVerifyToken: hashed } });
    if (!user) throw new BadRequestException('Invalid or expired verification token');

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });

    return { message: 'Email verified successfully' };
  }

  // ─── Verification Code (OTP) ─────────────────────────────────────────────────

  async sendVerificationCode(email: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    // Do not reveal whether the email exists
    if (!user) return { message: 'If that email is registered, a code has been sent.' };
    if (user.emailVerified) return { message: 'Email is already verified. You can log in.' };

    const code = randomInt(100000, 1000000).toString();
    // Store as "hash.expiryMs" so no schema change is needed
    const expiry = Date.now() + 15 * 60 * 1000;
    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerifyToken: `${this.sha256(code)}.${expiry}` },
    });

    await this.mail.sendVerificationCode(user.email, code);

    return { message: 'If that email is registered, a code has been sent.' };
  }

  async verifyCode(email: string, code: string): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email } });
    if (!user || !user.emailVerifyToken) {
      throw new BadRequestException('Invalid or expired verification code');
    }
    if (user.emailVerified) return { message: 'Email is already verified. You can log in.' };

    const dotIndex = user.emailVerifyToken.indexOf('.');
    if (dotIndex === -1) throw new BadRequestException('Invalid or expired verification code');

    const storedHash = user.emailVerifyToken.slice(0, dotIndex);
    const expiry = Number(user.emailVerifyToken.slice(dotIndex + 1));

    if (Number.isNaN(expiry) || Date.now() > expiry) {
      throw new BadRequestException('Verification code has expired. Request a new one.');
    }
    if (this.sha256(code) !== storedHash) {
      throw new BadRequestException('Invalid or expired verification code');
    }

    await this.prisma.user.update({
      where: { id: user.id },
      data: { emailVerified: true, emailVerifyToken: null },
    });

    return { message: 'Email verified successfully' };
  }

  // ─── Forgot Password ─────────────────────────────────────────────────────────

  async forgotPassword(dto: ForgotPasswordDto): Promise<{ message: string }> {
    const user = await this.prisma.user.findUnique({ where: { email: dto.email } });

    if (user) {
      const rawToken = this.generateToken();
      await this.prisma.user.update({
        where: { id: user.id },
        data: {
          passwordResetToken: this.sha256(rawToken),
          passwordResetExpiry: new Date(Date.now() + 60 * 60 * 1000),
        },
      });
      await this.mail.sendPasswordResetEmail(user.email, rawToken);
    }

    return { message: 'If that email is registered, a password reset link has been sent.' };
  }

  // ─── Reset Password ──────────────────────────────────────────────────────────

  async resetPassword(dto: ResetPasswordDto, res: Response): Promise<{ message: string }> {
    const hashed = this.sha256(dto.token);
    const user = await this.prisma.user.findFirst({
      where: { passwordResetToken: hashed, passwordResetExpiry: { gt: new Date() } },
    });
    if (!user) throw new BadRequestException('Invalid or expired reset token');

    const newHash = await bcrypt.hash(dto.password, 12);
    await this.prisma.user.update({
      where: { id: user.id },
      data: {
        password: newHash,
        passwordResetToken: null,
        passwordResetExpiry: null,
        refreshToken: null,
      },
    });

    this.clearRefreshCookie(res);
    return { message: 'Password reset successful. Please log in again.' };
  }

  // ─── Get Me ──────────────────────────────────────────────────────────────────

  async getMe(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      include: { developerProfile: true },
    });
    if (!user) throw new UnauthorizedException();
    const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
    return safe;
  }

  // ─── Update Me ───────────────────────────────────────────────────────────────

  async updateMe(userId: string, dto: UpdateProfileDto): Promise<SafeUser> {
    if (dto.phone) {
      const phoneTaken = await this.prisma.user.findFirst({
        where: { phone: dto.phone, NOT: { id: userId } },
      });
      if (phoneTaken) throw new ConflictException('Phone number already in use');
    }

    const updated = await this.prisma.user.update({
      where: { id: userId },
      data: {
        ...(dto.firstName && { firstName: dto.firstName }),
        ...(dto.lastName && { lastName: dto.lastName }),
        ...(dto.phone !== undefined && { phone: dto.phone }),
        ...(dto.avatarUrl !== undefined && { avatarUrl: dto.avatarUrl }),
      },
    });

    return this.sanitize(updated);
  }
}
