import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const CUSTOMER_ROLES = ['BUYER', 'INVESTOR', 'TENANT'];

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Customer (investor/tenant/buyer) starts — or resumes — a conversation with
   * the developer of a property or rent listing.
   */
  async startConversation(
    userId: string,
    opts: { propertySlug?: string; rentListingSlug?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');
    if (!CUSTOMER_ROLES.includes(user.role)) {
      throw new ForbiddenException('Only buyers, investors and tenants can start conversations');
    }

    let developerUserId: string | null = null;
    let propertyId: string | null = null;
    let rentListingId: string | null = null;
    let subject: string | null = null;

    if (opts.propertySlug) {
      const property = await this.prisma.property.findUnique({
        where: { slug: opts.propertySlug },
        include: { developer: true },
      });
      if (!property) throw new NotFoundException('Property not found');
      developerUserId = property.developer.userId;
      propertyId = property.id;
      subject = property.name;
    } else if (opts.rentListingSlug) {
      const listing = await this.prisma.rentListing.findUnique({
        where: { slug: opts.rentListingSlug },
        include: { developer: true },
      });
      if (!listing) throw new NotFoundException('Rent listing not found');
      developerUserId = listing.developer.userId;
      rentListingId = listing.id;
      subject = listing.name;
    } else {
      throw new BadRequestException('Provide propertySlug or rentListingSlug');
    }

    const existing = await this.prisma.conversation.findFirst({
      where: { customerId: userId, developerId: developerUserId, propertyId, rentListingId },
    });
    if (existing) return this.getConversation(userId, existing.id);

    const conversation = await this.prisma.conversation.create({
      data: {
        customerId: userId,
        developerId: developerUserId,
        propertyId,
        rentListingId,
        subject,
      },
    });
    return this.getConversation(userId, conversation.id);
  }

  /** All conversations for the current user (either side). */
  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ customerId: userId }, { developerId: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, role: true } },
        developer: {
          select: {
            id: true, firstName: true, lastName: true,
            developerProfile: { select: { companyName: true, logoUrl: true } },
          },
        },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
      },
    });
    return conversations.map((c) => ({
      id: c.id,
      subject: c.subject,
      propertyId: c.propertyId,
      rentListingId: c.rentListingId,
      customer: c.customer,
      developer: c.developer,
      lastMessage: c.messages[0] ?? null,
      unreadCount: c._count.messages,
      lastMessageAt: c.lastMessageAt,
    }));
  }

  /** Single conversation with participants — access limited to its two sides. */
  async getConversation(userId: string, id: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        customer: { select: { id: true, firstName: true, lastName: true, role: true } },
        developer: {
          select: {
            id: true, firstName: true, lastName: true,
            developerProfile: { select: { companyName: true, logoUrl: true } },
          },
        },
      },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    if (c.customerId !== userId && c.developerId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }
    return c;
  }

  /** Message history (ascending), marking the other side's messages read. */
  async getMessages(userId: string, conversationId: string, limit = 100) {
    await this.getConversation(userId, conversationId); // access check

    await this.prisma.chatMessage.updateMany({
      where: { conversationId, senderId: { not: userId }, readAt: null },
      data: { readAt: new Date() },
    });

    return this.prisma.chatMessage.findMany({
      where: { conversationId },
      orderBy: { createdAt: 'asc' },
      take: limit,
      include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
    });
  }

  /** Persist a message and return it with sender info. */
  async sendMessage(userId: string, conversationId: string, body: string) {
    const trimmed = body?.trim();
    if (!trimmed) throw new BadRequestException('Message cannot be empty');
    if (trimmed.length > 2000) throw new BadRequestException('Message is too long');

    const conversation = await this.getConversation(userId, conversationId);

    const [message] = await this.prisma.$transaction([
      this.prisma.chatMessage.create({
        data: { conversationId, senderId: userId, body: trimmed },
        include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.conversation.update({
        where: { id: conversationId },
        data: { lastMessageAt: new Date() },
      }),
    ]);

    return {
      message,
      recipientId: conversation.customerId === userId ? conversation.developerId : conversation.customerId,
    };
  }

  /** Total unread across all conversations (for nav badges). */
  async unreadCount(userId: string) {
    const count = await this.prisma.chatMessage.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: { OR: [{ customerId: userId }, { developerId: userId }] },
      },
    });
    return { count };
  }
}
