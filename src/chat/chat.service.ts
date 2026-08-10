import {
  BadRequestException, ForbiddenException, Injectable, NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

/** Roles that may open a conversation about a listing. */
const CUSTOMER_ROLES = ['BUYER', 'INVESTOR', 'TENANT'];

@Injectable()
export class ChatService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Start — or resume — a conversation.
   *
   * Three contexts are supported: a property, a rent listing, or an agent.
   * The first two reach the listing's developer; the third reaches the agent
   * directly, which is how a tenant or investor contacts someone from the
   * "Need agent help?" picker.
   *
   * Resuming rather than duplicating matters: contacting the same party about
   * the same thing twice should continue one thread, not fork the history.
   */
  async startConversation(
    userId: string,
    opts: { propertySlug?: string; rentListingSlug?: string; agentId?: string },
  ) {
    const user = await this.prisma.user.findUnique({ where: { id: userId } });
    if (!user) throw new NotFoundException('User not found');

    let counterpartyId: string | null = null;
    let propertyId: string | null = null;
    let rentListingId: string | null = null;
    let agentId: string | null = null;
    let subject: string | null = null;

    if (opts.agentId) {
      const agent = await this.prisma.agentProfile.findUnique({
        where: { id: opts.agentId },
        select: { id: true, userId: true, displayName: true, kybStatus: true, isListed: true },
      });
      // Only a publicly listed agent can be messaged — an unverified or
      // lapsed profile is not something the platform is standing behind.
      if (!agent || agent.kybStatus !== 'APPROVED' || !agent.isListed) {
        throw new NotFoundException('Agent not found');
      }
      if (agent.userId === userId) {
        throw new BadRequestException('You cannot start a conversation with yourself');
      }
      counterpartyId = agent.userId;
      agentId = agent.id;
      subject = agent.displayName;
    } else if (opts.propertySlug) {
      if (!CUSTOMER_ROLES.includes(user.role)) {
        throw new ForbiddenException('Only buyers, investors and tenants can start conversations');
      }
      const property = await this.prisma.property.findUnique({
        where: { slug: opts.propertySlug },
        include: { developer: true },
      });
      if (!property) throw new NotFoundException('Property not found');
      counterpartyId = property.developer.userId;
      propertyId = property.id;
      subject = property.name;
    } else if (opts.rentListingSlug) {
      if (!CUSTOMER_ROLES.includes(user.role)) {
        throw new ForbiddenException('Only buyers, investors and tenants can start conversations');
      }
      const listing = await this.prisma.rentListing.findUnique({
        where: { slug: opts.rentListingSlug },
        include: { developer: true },
      });
      if (!listing) throw new NotFoundException('Rent listing not found');
      counterpartyId = listing.developer.userId;
      rentListingId = listing.id;
      subject = listing.name;
    } else {
      throw new BadRequestException('Provide propertySlug, rentListingSlug or agentId');
    }

    // Either side may have opened the original thread, so match on the pair
    // in both directions — otherwise an agent replying first would leave the
    // customer starting a second, parallel conversation.
    const existing = await this.prisma.conversation.findFirst({
      where: {
        propertyId,
        rentListingId,
        agentId,
        OR: [
          { initiatorId: userId, counterpartyId },
          { initiatorId: counterpartyId, counterpartyId: userId },
        ],
      },
    });
    if (existing) return this.getConversation(userId, existing.id);

    const conversation = await this.prisma.conversation.create({
      data: {
        initiatorId: userId,
        counterpartyId,
        propertyId,
        rentListingId,
        agentId,
        subject,
      },
    });
    return this.getConversation(userId, conversation.id);
  }

  /**
   * Both sides are selected identically, since either can now be a customer,
   * a developer or an agent — the profile relations are included so the inbox
   * can show a company or trading name rather than a personal one.
   */
  private static readonly PARTY_SELECT = {
    id: true,
    firstName: true,
    lastName: true,
    role: true,
    avatarUrl: true,
    developerProfile: { select: { companyName: true, logoUrl: true } },
    agentProfile: { select: { id: true, displayName: true, logoUrl: true, photoUrl: true } },
  } as const;

  /** All conversations for the current user (either side). */
  async listConversations(userId: string) {
    const conversations = await this.prisma.conversation.findMany({
      where: { OR: [{ initiatorId: userId }, { counterpartyId: userId }] },
      orderBy: { lastMessageAt: 'desc' },
      include: {
        initiator: { select: ChatService.PARTY_SELECT },
        counterparty: { select: ChatService.PARTY_SELECT },
        messages: { orderBy: { createdAt: 'desc' }, take: 1 },
        _count: { select: { messages: { where: { readAt: null, senderId: { not: userId } } } } },
      },
    });
    return conversations.map((c) => {
      const iAmInitiator = c.initiatorId === userId;
      return {
        id: c.id,
        subject: c.subject,
        propertyId: c.propertyId,
        rentListingId: c.rentListingId,
        agentId: c.agentId,
        initiator: c.initiator,
        counterparty: c.counterparty,
        // The inbox always wants "who am I talking to", which used to mean
        // reading customer or developer depending on your own role.
        otherParty: iAmInitiator ? c.counterparty : c.initiator,
        lastMessage: c.messages[0] ?? null,
        unreadCount: c._count.messages,
        lastMessageAt: c.lastMessageAt,
      };
    });
  }

  /** Single conversation with participants — access limited to its two sides. */
  async getConversation(userId: string, id: string) {
    const c = await this.prisma.conversation.findUnique({
      where: { id },
      include: {
        initiator: { select: ChatService.PARTY_SELECT },
        counterparty: { select: ChatService.PARTY_SELECT },
      },
    });
    if (!c) throw new NotFoundException('Conversation not found');
    if (c.initiatorId !== userId && c.counterpartyId !== userId) {
      throw new ForbiddenException('Not your conversation');
    }
    return {
      ...c,
      otherParty: c.initiatorId === userId ? c.counterparty : c.initiator,
    };
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
      recipientId:
        conversation.initiatorId === userId
          ? conversation.counterpartyId
          : conversation.initiatorId,
    };
  }

  /** Total unread across all conversations (for nav badges). */
  async unreadCount(userId: string) {
    const count = await this.prisma.chatMessage.count({
      where: {
        readAt: null,
        senderId: { not: userId },
        conversation: { OR: [{ initiatorId: userId }, { counterpartyId: userId }] },
      },
    });
    return { count };
  }
}
