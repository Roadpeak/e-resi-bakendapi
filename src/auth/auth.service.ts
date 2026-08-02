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
    if (!user.emailVerified) throw new ForbiddenException('Please verify your email before logging in');

    const rawRefresh = this.generateToken();
    const hashedRefresh = this.sha256(rawRefresh);

    await this.prisma.user.update({
      where: { id: user.id },
      data: { refreshToken: hashedRefresh, lastLoginAt: new Date() },
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
