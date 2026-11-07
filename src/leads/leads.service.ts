import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

/** Where a lead reached the developer from, as the Leads page groups them. */
export type LeadChannel = 'AUTOMATIC' | 'AGENT' | 'MANUAL';
export type LeadKind = 'INQUIRY' | 'BOOKING' | 'AGENT_DEAL' | 'MANUAL';

export interface LeadRow {
  id: string;
  kind: LeadKind;
  channel: LeadChannel;
  /** Human label for where it came from: "Website inquiry", "Walk-in"… */
  sourceLabel: string;
  name: string;
  email: string | null;
  phone: string | null;
  property: { id: string; name: string; slug: string } | null;
  agent: { id: string; displayName: string } | null;
  status: string;
  interest: string | null;
  message: string | null;
  budget: number | null;
  addedBy: string | null;
  createdAt: Date;
}

const SOURCE_LABEL: Record<string, string> = {
  WALK_IN: 'Walk-in', PHONE_CALL: 'Phone call', REFERRAL: 'Referral', EVENT: 'Event',
  SOCIAL_MEDIA: 'Social media', EMAIL: 'Email', WEBSITE: 'Website', AGENT: 'Agent', OTHER: 'Other',
};

/** Per-source cap: the page shows the most recent leads, newest first. */
const TAKE = 500;

/**
 * One list of every lead a developer has, from wherever it came:
 * inquiries and viewing requests from their pages (automatic), clients
 * agents registered or referred (agent), and people their team added by
 * hand (manual). Only manual leads are stored here; the rest are read
 * from their own tables so nothing is duplicated or drifts.
 */
@Injectable()
export class LeadsService {
  constructor(private readonly prisma: PrismaService) {}

  private async developerOf(userId: string) {
    const dev = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!dev) throw new ForbiddenException('Developer profile required');
    return dev;
  }

  async list(userId: string) {
    const dev = await this.developerOf(userId);
    const properties = await this.prisma.property.findMany({
      where: { developerId: dev.id },
      select: { id: true, name: true, slug: true },
    });
    const propertyIds = properties.map((p) => p.id);
    const prop = { select: { id: true, name: true, slug: true } } as const;
    const agent = { select: { id: true, displayName: true } } as const;

    const [inquiries, bookings, deals, manual] = await Promise.all([
      this.prisma.inquiry.findMany({
        where: { propertyId: { in: propertyIds } },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.booking.findMany({
        where: { propertyId: { in: propertyIds } },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.deal.findMany({
        where: { developerId: dev.id },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.developerLead.findMany({
        where: { developerId: dev.id },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
    ]);

    const rows: LeadRow[] = [
      ...inquiries.map((i): LeadRow => ({
        id: i.id, kind: 'INQUIRY', channel: i.agentId ? 'AGENT' : 'AUTOMATIC',
        sourceLabel: i.agentId ? 'Agent referral · inquiry' : 'Website inquiry',
        name: i.name, email: i.email, phone: i.phone ?? null,
        property: i.property, agent: i.agent, status: i.status,
        interest: i.interestedUnit ?? null, message: i.message, budget: null, addedBy: null, createdAt: i.createdAt,
      })),
      ...bookings.map((b): LeadRow => ({
        id: b.id, kind: 'BOOKING', channel: b.agentId ? 'AGENT' : 'AUTOMATIC',
        sourceLabel: `${b.agentId ? 'Agent referral · ' : ''}${b.type === 'VIRTUAL' ? 'Virtual tour request' : 'Viewing request'}`,
        name: b.name, email: b.email, phone: b.phone ?? null,
        property: b.property, agent: b.agent, status: b.status,
        interest: null, message: b.message ?? null, budget: null, addedBy: null, createdAt: b.createdAt,
      })),
      ...deals.map((d): LeadRow => ({
        id: d.id, kind: 'AGENT_DEAL', channel: 'AGENT', sourceLabel: 'Registered by agent',
        name: d.clientName, email: d.clientEmail ?? null, phone: d.clientPhone ?? null,
        property: d.property, agent: d.agent, status: d.stage,
        interest: null, message: null, budget: null, addedBy: null, createdAt: d.createdAt,
      })),
      ...manual.map((m): LeadRow => ({
        id: m.id, kind: 'MANUAL', channel: 'MANUAL', sourceLabel: SOURCE_LABEL[m.source] ?? 'Other',
        name: m.name, email: m.email ?? null, phone: m.phone ?? null,
        property: m.property, agent: m.agent, status: m.status,
        interest: m.interest ?? null, message: m.notes ?? null, budget: m.budget ?? null,
        addedBy: m.createdByName ?? null, createdAt: m.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { leads: rows, properties };
  }

  private async assertProperty(developerId: string, propertyId?: string | null) {
    if (!propertyId) return;
    const ok = await this.prisma.property.count({ where: { id: propertyId, developerId } });
    if (!ok) throw new BadRequestException('That development is not one of yours');
  }

  async create(userId: string, author: { id: string; name: string }, dto: CreateLeadDto) {
    const dev = await this.developerOf(userId);
    if (!dto.email?.trim() && !dto.phone?.trim()) {
      throw new BadRequestException('Add a phone number or an email so the team can reach them');
    }
    await this.assertProperty(dev.id, dto.propertyId);
    return this.prisma.developerLead.create({
      data: {
        developerId: dev.id,
        name: dto.name.trim(),
        email: dto.email?.trim().toLowerCase() || null,
        phone: dto.phone?.trim() || null,
        propertyId: dto.propertyId || null,
        source: dto.source ?? 'OTHER',
        status: dto.status ?? 'NEW',
        interest: dto.interest?.trim() || null,
        budget: dto.budget ?? null,
        notes: dto.notes?.trim() || null,
        createdById: author.id,
        createdByName: author.name,
      },
    });
  }

  private async ownLead(userId: string, id: string) {
    const dev = await this.developerOf(userId);
    const lead = await this.prisma.developerLead.findFirst({ where: { id, developerId: dev.id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return { dev, lead };
  }

  async update(userId: string, id: string, dto: UpdateLeadDto) {
    const { dev, lead } = await this.ownLead(userId, id);
    if (dto.propertyId !== undefined) await this.assertProperty(dev.id, dto.propertyId);
    const email = dto.email !== undefined ? dto.email?.trim().toLowerCase() || null : lead.email;
    const phone = dto.phone !== undefined ? dto.phone?.trim() || null : lead.phone;
    if (!email && !phone) throw new BadRequestException('Keep a phone number or an email for this lead');
    return this.prisma.developerLead.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        email, phone,
        ...(dto.propertyId !== undefined && { propertyId: dto.propertyId || null }),
        ...(dto.source !== undefined && { source: dto.source }),
        ...(dto.status !== undefined && { status: dto.status }),
        ...(dto.interest !== undefined && { interest: dto.interest?.trim() || null }),
        ...(dto.budget !== undefined && { budget: dto.budget ?? null }),
        ...(dto.notes !== undefined && { notes: dto.notes?.trim() || null }),
      },
    });
  }

  async remove(userId: string, id: string) {
    await this.ownLead(userId, id);
    await this.prisma.developerLead.delete({ where: { id } });
    return { message: 'Lead deleted' };
  }
}
