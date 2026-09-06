import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { KybStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Client rooms — an agent's private shortlist for one buyer.
 *
 * The sales motion this serves is specific: an agent working a diaspora
 * buyer picks a handful of developments, writes a covering note, and sends
 * one link into the WhatsApp thread. The buyer opens immersive tours with
 * the agent's name and contact on the page; the agent sees which property
 * the client kept returning to, which is what to lead the next call with.
 *
 * Access is the link. No login, no invitation flow — the room rides in a
 * private chat and inherits its trust model. The token is unguessable and
 * a room can be switched off the moment it should stop working.
 */

/** What the public room shows per property. Public-safe fields only. */
const ROOM_PROPERTY_SELECT = {
  id: true,
  slug: true,
  name: true,
  tagline: true,
  heroImageUrl: true,
  city: true,
  neighborhood: true,
  priceFrom: true,
  currency: true,
  category: true,
} as const;

@Injectable()
export class ClientRoomsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The caller's agent profile, verified.
   *
   * Rooms carry the agent's face and name to a member of the public, so
   * they are gated on the same KYB approval as the directory — an
   * unverified agent presenting verified-looking pages is exactly the
   * impersonation the verification exists to prevent.
   */
  private async requireAgent(userId: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId },
      select: { id: true, kybStatus: true, displayName: true },
    });
    if (!agent) throw new ForbiddenException('Only agents have client rooms');
    if (agent.kybStatus !== KybStatus.APPROVED) {
      throw new ForbiddenException('Client rooms unlock once your verification is approved');
    }
    return agent;
  }

  private async assertMine(roomId: string, userId: string) {
    const room = await this.prisma.clientRoom.findUnique({
      where: { id: roomId },
      include: { agent: { select: { userId: true } } },
    });
    if (!room || room.agent.userId !== userId) throw new NotFoundException('Room not found');
    return room;
  }

  /** Only published properties can be put in front of a client. */
  private async validateProperties(propertyIds: string[]) {
    if (!propertyIds.length) return;
    const found = await this.prisma.property.count({
      where: { id: { in: propertyIds }, status: 'ACTIVE' },
    });
    if (found !== new Set(propertyIds).size) {
      throw new BadRequestException('Every property in a room must be a live listing');
    }
  }

  async create(
    userId: string,
    dto: { title: string; clientName?: string; note?: string; propertyIds?: string[] },
  ) {
    const agent = await this.requireAgent(userId);
    const propertyIds = [...new Set(dto.propertyIds ?? [])];
    await this.validateProperties(propertyIds);

    return this.prisma.clientRoom.create({
      data: {
        agentId: agent.id,
        // base64url, 12 bytes: unguessable, short enough for WhatsApp.
        token: randomBytes(12).toString('base64url'),
        title: dto.title.trim(),
        clientName: dto.clientName?.trim() || null,
        note: dto.note?.trim() || null,
        items: {
          create: propertyIds.map((propertyId, order) => ({ propertyId, order })),
        },
      },
      include: { items: { orderBy: { order: 'asc' } } },
    });
  }

  /**
   * The agent's rooms, with the numbers that matter at a glance: how many
   * times it was opened, and when it was last touched — silence after a
   * send is itself information.
   */
  async listMine(userId: string) {
    const agent = await this.requireAgent(userId);
    const rooms = await this.prisma.clientRoom.findMany({
      where: { agentId: agent.id },
      orderBy: { updatedAt: 'desc' },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { property: { select: ROOM_PROPERTY_SELECT } },
        },
        _count: { select: { views: true } },
      },
    });

    // Last-open per room in one query rather than one per row.
    const lastViews = await this.prisma.clientRoomView.groupBy({
      by: ['roomId'],
      where: { roomId: { in: rooms.map((r) => r.id) } },
      _max: { createdAt: true },
    });
    const lastByRoom = new Map(lastViews.map((v) => [v.roomId, v._max.createdAt]));
    return rooms.map((r) => ({ ...r, lastViewedAt: lastByRoom.get(r.id) ?? null }));
  }

  /** One room with per-property engagement — the "which one did they love" view. */
  async getOne(roomId: string, userId: string) {
    await this.assertMine(roomId, userId);
    const room = await this.prisma.clientRoom.findUnique({
      where: { id: roomId },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { property: { select: ROOM_PROPERTY_SELECT } },
        },
      },
    });
    const views = await this.prisma.clientRoomView.groupBy({
      by: ['propertyId', 'kind'],
      where: { roomId },
      _count: true,
    });
    const opens = views.find((v) => v.kind === 'OPEN' && v.propertyId === null)?._count ?? 0;
    const perProperty = Object.fromEntries(
      views
        .filter((v) => v.propertyId)
        .map((v) => [v.propertyId as string, v._count]),
    );
    return { ...room, opens, perProperty };
  }

  async update(
    roomId: string,
    userId: string,
    dto: { title?: string; clientName?: string; note?: string; isActive?: boolean },
  ) {
    await this.assertMine(roomId, userId);
    return this.prisma.clientRoom.update({
      where: { id: roomId },
      data: {
        ...(dto.title !== undefined && { title: dto.title.trim() }),
        ...(dto.clientName !== undefined && { clientName: dto.clientName.trim() || null }),
        ...(dto.note !== undefined && { note: dto.note.trim() || null }),
        ...(dto.isActive !== undefined && { isActive: dto.isActive }),
      },
    });
  }

  /**
   * Replace the shortlist wholesale.
   *
   * One endpoint rather than add/remove/reorder three ways: the client of
   * this API is a picker UI whose natural output is "the list, in order",
   * and reconciling that server-side beats making the UI issue a diff.
   */
  async setItems(roomId: string, userId: string, propertyIds: string[]) {
    await this.assertMine(roomId, userId);
    const unique = [...new Set(propertyIds)];
    await this.validateProperties(unique);
    await this.prisma.$transaction([
      this.prisma.clientRoomItem.deleteMany({ where: { roomId } }),
      this.prisma.clientRoomItem.createMany({
        data: unique.map((propertyId, order) => ({ roomId, propertyId, order })),
      }),
      this.prisma.clientRoom.update({ where: { id: roomId }, data: { updatedAt: new Date() } }),
    ]);
    return this.getOne(roomId, userId);
  }

  async remove(roomId: string, userId: string) {
    await this.assertMine(roomId, userId);
    await this.prisma.clientRoom.delete({ where: { id: roomId } });
    return { message: 'Room deleted' };
  }

  // ─── Public ───────────────────────────────────────────────────────────────

  /**
   * The room as the client sees it. Unauthenticated by design — see the
   * header comment. Records the open.
   */
  async publicGet(token: string) {
    const room = await this.prisma.clientRoom.findUnique({
      where: { token },
      include: {
        items: {
          orderBy: { order: 'asc' },
          include: { property: { select: ROOM_PROPERTY_SELECT } },
        },
        agent: {
          select: {
            id: true,
            displayName: true,
            kind: true,
            photoUrl: true,
            logoUrl: true,
            phone: true,
            whatsapp: true,
            email: true,
            ratingAverage: true,
            ratingCount: true,
            kybStatus: true,
          },
        },
      },
    });
    // A switched-off room and a never-existing one answer identically:
    // the link simply stops working, with nothing to probe.
    if (!room || !room.isActive || room.agent.kybStatus !== KybStatus.APPROVED) {
      throw new NotFoundException('Room not found');
    }

    // Fire-and-forget; a failed count must never break the client's view.
    this.prisma.clientRoomView
      .create({ data: { roomId: room.id, kind: 'OPEN' } })
      .catch(() => undefined);

    const { kybStatus: _hidden, ...agent } = room.agent;
    return { ...room, agent };
  }

  /** The client opened one of the properties — the signal the agent reads. */
  async publicTrack(token: string, propertyId: string) {
    const room = await this.prisma.clientRoom.findUnique({
      where: { token },
      select: { id: true, isActive: true, items: { select: { propertyId: true } } },
    });
    if (!room?.isActive) return { ok: true };
    // Only count properties actually in the room — anything else is noise
    // or probing, and neither belongs in the agent's engagement numbers.
    if (!room.items.some((i) => i.propertyId === propertyId)) return { ok: true };
    await this.prisma.clientRoomView
      .create({ data: { roomId: room.id, propertyId, kind: 'PROPERTY' } })
      .catch(() => undefined);
    return { ok: true };
  }
}
