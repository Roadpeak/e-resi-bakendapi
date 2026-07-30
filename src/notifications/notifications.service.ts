import { Injectable, NotFoundException } from '@nestjs/common';
import { NotificationType } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

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
  ) {
    return this.prisma.notification.create({
      data: { userId, type, title, body, resourceId, resourceType },
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

    return {
      data,
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
