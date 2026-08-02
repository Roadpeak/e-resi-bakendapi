import { Injectable, Logger } from '@nestjs/common';
import { NotificationType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { MailService } from '../mail/mail.service.js';
import { PricingService } from './pricing.service.js';

@Injectable()
export class AdminSystemService {
  private readonly logger = new Logger(AdminSystemService.name);
  private readonly startedAt = Date.now();

  constructor(
    private readonly prisma: PrismaService,
    private readonly mail: MailService,
    private readonly pricing: PricingService,
  ) {}

  /**
   * Send an in-app notification to every user in a segment.
   * Written in chunks so a large audience doesn't build one enormous statement.
   */
  async broadcast(params: {
    role?: UserRole;
    title: string;
    body: string;
    type?: NotificationType;
  }): Promise<{ sent: number }> {
    const recipients = await this.prisma.user.findMany({
      where: {
        isActive: true,
        ...(params.role && { role: params.role }),
      },
      select: { id: true },
    });

    const CHUNK = 500;
    let sent = 0;
    for (let i = 0; i < recipients.length; i += CHUNK) {
      const batch = recipients.slice(i, i + CHUNK);
      await this.prisma.notification.createMany({
        data: batch.map((u) => ({
          userId: u.id,
          type: params.type ?? NotificationType.SYSTEM_ANNOUNCEMENT,
          title: params.title,
          body: params.body,
        })),
      });
      sent += batch.length;
    }

    return { sent };
  }

  /** Recent notifications, so an admin can confirm a broadcast landed. */
  async recentNotifications(limit = 25) {
    return this.prisma.notification.findMany({
      take: limit,
      orderBy: { createdAt: 'desc' },
      include: { user: { select: { email: true, role: true } } },
    });
  }

  // ─── Settings ─────────────────────────────────────────────────────────────

  async settings(group?: string) {
    return this.pricing.listSettings(group);
  }

  async updateSetting(key: string, value: string) {
    return this.pricing.updateSetting(key, value);
  }

  // ─── Health ───────────────────────────────────────────────────────────────

  /**
   * Component-by-component status. Mail is checked explicitly because it fails
   * silently in this system — the code falls back to logging the message, so a
   * broken SMTP config looks like success until someone reports a missing email.
   */
  async health() {
    const checks: { name: string; ok: boolean; detail: string }[] = [];

    // Database
    try {
      const t0 = Date.now();
      await this.prisma.$queryRaw`SELECT 1`;
      checks.push({ name: 'Database', ok: true, detail: `responded in ${Date.now() - t0}ms` });
    } catch (err) {
      checks.push({ name: 'Database', ok: false, detail: (err as Error).message });
    }

    // Mail
    try {
      const ok = await this.mail.verifyConnection();
      checks.push({
        name: 'Email (SMTP)',
        ok,
        detail: ok
          ? 'connected'
          : 'not connected — verification codes are only being written to the server log',
      });
    } catch (err) {
      checks.push({ name: 'Email (SMTP)', ok: false, detail: (err as Error).message });
    }

    // Media storage
    const cloudinary = Boolean(process.env.CLOUDINARY_CLOUD_NAME);
    checks.push({
      name: 'Media storage',
      ok: true,
      detail: cloudinary ? 'Cloudinary configured' : 'local disk (uploads/) — not for production',
    });

    const [users, properties, payments] = await Promise.all([
      this.prisma.user.count(),
      this.prisma.property.count(),
      this.prisma.payment.count(),
    ]);

    return {
      checks,
      uptimeSeconds: Math.floor((Date.now() - this.startedAt) / 1000),
      environment: process.env.NODE_ENV ?? 'development',
      counts: { users, properties, payments },
    };
  }
}
