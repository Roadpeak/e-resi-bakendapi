import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

import { resolveNotificationLink } from './notification-links.js';
@Injectable()
export class NotificationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Internal: create notification ───────────────────────────────────────

  async createNotification(
    userId: string,
    type: NotificationType,
    title: string,
    body: string,
    resourceId?: string,
    resourceType?: string,
    link?: string,
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, resourceId, resourceType, link },
    });
  }

  // ─── Get user notifications ───────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto, unreadOnly = false) {
    const where = { userId, ...(unreadOnly && { read: false }) };

    const [data, total, unreadCount] = await Promise.all([
      this.prisma.notification.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.notification.count({ where }),
      this.prisma.notification.count({ where: { userId, read: false } }),
    ]);

    // Every portal opens notifications through `link`, resolved for this
    // reader's role — the same event leads developers and agents to their own
    // pages. Property notifications need the slug, looked up in one query.
    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { role: true } });
    const propertyIds = [...new Set(data.filter((n) => n.resourceType === 'Property' && n.resourceId).map((n) => n.resourceId!))];
    const slugs = propertyIds.length
      ? new Map((await this.prisma.property.findMany({
          where: { id: { in: propertyIds } }, select: { id: true, slug: true },
        })).map((p) => [p.id, p.slug]))
      : new Map<string, string>();

    return {
      data: data.map((n) => ({
        ...n,
        link: resolveNotificationLink(n, user?.role, n.resourceId ? slugs.get(n.resourceId) : undefined),
      })),
      unreadCount,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Mark as read ─────────────────────────────────────────────────────────

  async markRead(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification) throw new NotFoundException('Notification not found');
    if (notification.userId !== userId) throw new NotFoundException('Notification not found');
    return this.prisma.notification.update({ where: { id }, data: { read: true } });
  }

  // ─── Mark all as read ─────────────────────────────────────────────────────

  async markAllRead(userId: string) {
    const { count } = await this.prisma.notification.updateMany({
      where: { userId, read: false },
      data: { read: true },
    });
    return { message: `${count} notification(s) marked as read` };
  }

  // ─── Delete notification ──────────────────────────────────────────────────

  async remove(id: string, userId: string) {
    const notification = await this.prisma.notification.findUnique({ where: { id } });
    if (!notification || notification.userId !== userId) throw new NotFoundException('Notification not found');
    await this.prisma.notification.delete({ where: { id } });
    return { message: 'Notification deleted' };
  }

  // ─── Unread count ─────────────────────────────────────────────────────────

  async unreadCount(userId: string) {
    const count = await this.prisma.notification.count({ where: { userId, read: false } });
    return { count };
  }
}
