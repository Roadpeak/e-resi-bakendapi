import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as nodemailer from 'nodemailer';
import { resolveAppUrl } from '../common/app-url.js';
import {
  renderDocument, renderDocumentText, renderNotice, type DocumentParams,
} from './templates/document.js';

interface SendArgs {
  to: string;
  subject: string;
  html: string;
  text?: string;
}

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);
  private readonly transporter: nodemailer.Transporter;
  private readonly from: string;
  private readonly frontendUrl: string;
  private readonly resendKey: string;

  constructor(private config: ConfigService) {
    this.resendKey = config.get<string>('RESEND_API_KEY', '');

    this.transporter = nodemailer.createTransport({
      host: config.get<string>('SMTP_HOST'),
      port: config.get<number>('SMTP_PORT', 587),
      secure: config.get<string>('SMTP_SECURE') === 'true',
      auth: {
        user: config.get<string>('SMTP_USER'),
        pass: config.get<string>('SMTP_PASS'),
      },
      // Without these, nodemailer waits roughly two minutes per stage. On a
      // host that blocks outbound SMTP the connection never completes, so any
      // request awaiting a send outlives the gateway timeout and the caller
      // sees a 504 for work that actually succeeded.
      connectionTimeout: 10_000,
      greetingTimeout: 10_000,
      socketTimeout: 15_000,
    });

    this.from = config.get<string>('SMTP_FROM', 'e-resi <noreply@e-resi.com>');
    this.frontendUrl = resolveAppUrl(config);

    if (this.resendKey) {
      this.logger.log('Mail transport: Resend HTTP API');
    } else {
      this.logger.warn('Mail transport: SMTP — blocked on hosts that filter outbound mail ports');
    }
  }

  /**
   * Send an email.
   *
   * Prefers Resend's HTTP API. DigitalOcean blocks outbound ports 25, 465 and
   * 587 and will not lift it, so SMTP cannot work in production at all —
   * HTTP sidesteps the restriction rather than working around it. SMTP is kept
   * as the fallback so local development and any non-blocked host still work
   * unchanged.
   */
  private async dispatch({ to, subject, html, text }: SendArgs): Promise<void> {
    if (this.resendKey) {
      const res = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.resendKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ from: this.from, to: [to], subject, html, ...(text && { text }) }),
        // Bounded so a slow provider can never stall a request the way
        // blocked SMTP did.
        signal: AbortSignal.timeout(15_000),
      });

      if (!res.ok) {
        const body = await res.text().catch(() => '');
        throw new Error(`Resend rejected the message (${res.status}): ${body.slice(0, 200)}`);
      }
      return;
    }

    await this.transporter.sendMail({ from: this.from, to, subject, html, ...(text && { text }) });
  }

  /**
   * Probe the configured transport. Sending falls back to logging on failure,
   * so a broken config is otherwise invisible until someone reports a missing
   * email.
   */
  async verifyConnection(): Promise<boolean> {
    if (this.resendKey) {
      try {
        const res = await fetch('https://api.resend.com/domains', {
          headers: { Authorization: `Bearer ${this.resendKey}` },
          signal: AbortSignal.timeout(10_000),
        });
        if (!res.ok) throw new Error(`Resend returned ${res.status}`);
        return true;
      } catch (err) {
        this.logger.warn(`Resend verification failed: ${(err as Error).message}`);
        return false;
      }
    }
    try {
      await this.transporter.verify();
      return true;
    } catch (err) {
      this.logger.warn(`SMTP verification failed: ${(err as Error).message}`);
      return false;
    }
  }

  async sendVerificationEmail(to: string, token: string): Promise<void> {
    const link = `${this.frontendUrl}/verify-email?token=${token}`;
    try {
      await this.dispatch({
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
      await this.dispatch({
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
      await this.dispatch({
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

  /**
   * Send a billing document (invoice, reminder or receipt).
   *
   * Never throws. A failed email must not roll back the invoice it describes —
   * the record is the source of truth and the customer can always see it in
   * the dashboard. Returns whether the send actually succeeded so callers can
   * record it.
   */
  async sendDocument(to: string, subject: string, doc: DocumentParams): Promise<boolean> {
    try {
      await this.dispatch({
        to,
        subject,
        html: renderDocument(doc),
        text: renderDocumentText(doc),
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(err as Error).message}`);
      return false;
    }
  }

  /** Plain transactional note — card linked, charge reversed, and similar. */
  async sendNotice(
    to: string,
    subject: string,
    heading: string,
    body: string,
    cta?: { label: string; url: string },
  ): Promise<boolean> {
    try {
      await this.dispatch({
        to,
        subject,
        html: renderNotice({ heading, body, cta }),
        text: `${heading}\n\n${body}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}`,
      });
      return true;
    } catch (err) {
      this.logger.error(`Failed to send "${subject}" to ${to}: ${(err as Error).message}`);
      return false;
    }
  }
}
