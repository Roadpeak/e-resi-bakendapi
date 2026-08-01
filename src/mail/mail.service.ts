import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;

  constructor(private config: ConfigService) {
    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
    });
    this.from = config.get<string>('SMTP_FROM', 'e-resi <noreply@e-resi.co.ke>');
    this.frontendUrl = config.get<string>('FRONTEND_URL', 'http://localhost:3000');
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/verify-email?token=${token}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Verify your e-resi email address',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0f172a;">Welcome to e-resi</h2>
            <p>Click the button below to verify your email address. This link expires in 24 hours.</p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
              Verify Email
            </a>
            <p style="margin-top:24px;color:#64748b;font-size:13px;">
              Or copy this link: <a href="${link}">${link}</a>
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification email to ${to}`, err);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] Verify token for ${to}: ${token}`);
        return;
      }
      throw new InternalServerErrorException('Failed to send verification email');
    }
  }

  async sendVerificationCode(to: string, code: string): Promise<void> {
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: `${code} is your e-resi verification code`,
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0f172a;">Verify your email</h2>
            <p>Enter this code to verify your e-resi account. It expires in 15 minutes.</p>
            <p style="font-size:32px;font-weight:700;letter-spacing:8px;color:#0f172a;">${code}</p>
            <p style="margin-top:24px;color:#64748b;font-size:13px;">
              If you didn't request this, you can safely ignore this email.
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send verification code to ${to}`, err);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] Verification code for ${to}: ${code}`);
        return;
      }
      throw new InternalServerErrorException('Failed to send verification code');
    }
  }

  async sendPasswordResetEmail(to: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/reset-password?token=${token}`;
    try {
      await this.transporter.sendMail({
        from: this.from,
        to,
        subject: 'Reset your e-resi password',
        html: `
          <div style="font-family:sans-serif;max-width:520px;margin:0 auto;">
            <h2 style="color:#0f172a;">Password Reset Request</h2>
            <p>Click the button below to reset your password. This link expires in 1 hour.</p>
            <a href="${link}" style="display:inline-block;padding:12px 24px;background:#6366f1;color:#fff;border-radius:8px;text-decoration:none;font-weight:600;">
              Reset Password
            </a>
            <p style="margin-top:24px;color:#64748b;font-size:13px;">
              If you did not request a password reset, you can safely ignore this email.
            </p>
            <p style="color:#64748b;font-size:13px;">
              Or copy this link: <a href="${link}">${link}</a>
            </p>
          </div>
        `,
      });
    } catch (err) {
      this.logger.error(`Failed to send password reset email to ${to}`, err);
      if (process.env.NODE_ENV !== 'production') {
        this.logger.warn(`[DEV] Reset token for ${to}: ${token}`);
        return;
      }
      throw new InternalServerErrorException('Failed to send password reset email');
    }
  }
}
