import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { AnalyticsService } from '../analytics/analytics.service.js';
import { describeSiteLead } from '../billing/agent-site-leads.service.js';
import type { CreateLeadDto } from './dto/create-lead.dto.js';
import type { UpdateLeadDto } from './dto/update-lead.dto.js';

/** Where a lead reached the developer from, as the Leads page groups them. */
export type LeadChannel = 'AUTOMATIC' | 'AGENT' | 'MANUAL';
export type LeadKind = 'INQUIRY' | 'BOOKING' | 'AGENT_DEAL' | 'MANUAL' | 'VIEWER' | 'SITE';

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
  /** Raw source key, for editing hand-added leads. */
  source?: string;
  /** For page viewers: what to pass to POST /analytics/viewers/capture. */
  viewer?: { userId: string; propertyId: string; views: number };
  /** Website leads: what the form asked, as label/value pairs. */
  details?: { label: string; value: string }[];
  /** Website leads: which form. */
  siteType?: string;
  createdAt: Date;
}

const SOURCE_LABEL: Record<string, string> = {
  WALK_IN: 'Walk-in', PHONE_CALL: 'Phone call', REFERRAL: 'Referral', EVENT: 'Event',
  SOCIAL_MEDIA: 'Social media', EMAIL: 'Email', WEBSITE: 'Website', AGENT: 'Agent', OTHER: 'Other',
};

interface LeadOwner {
  kind: 'DEVELOPER' | 'AGENT';
  id: string;
  propertyWhere: { developerId: string } | { listedByAgentId: string };
  leadWhere: { developerId: string } | { ownerAgentId: string };
}

/** How far back page viewers count as leads. */
const VIEWER_DAYS = 365;

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
  constructor(
    private readonly prisma: PrismaService,
    private readonly analytics: AnalyticsService,
  ) {}

  /**
   * Whose leads these are: a developer, or an agent for the developments
   * they list themselves (plus the clients they refer elsewhere).
   */
  private async ownerOf(userId: string): Promise<LeadOwner> {
    const dev = await this.prisma.developerProfile.findUnique({ where: { userId }, select: { id: true } });
    if (dev) {
      return { kind: 'DEVELOPER', id: dev.id, propertyWhere: { developerId: dev.id }, leadWhere: { developerId: dev.id } };
    }
    const agent = await this.prisma.agentProfile.findUnique({ where: { userId }, select: { id: true } });
    if (agent) {
      return { kind: 'AGENT', id: agent.id, propertyWhere: { listedByAgentId: agent.id }, leadWhere: { ownerAgentId: agent.id } };
    }
    throw new ForbiddenException('Developer or agent profile required');
  }

  async list(userId: string) {
    const owner = await this.ownerOf(userId);
    const isAgent = owner.kind === 'AGENT';
    const properties = await this.prisma.property.findMany({
      where: owner.propertyWhere,
      select: { id: true, name: true, slug: true },
    });
    const propertyIds = properties.map((p) => p.id);
    const prop = { select: { id: true, name: true, slug: true } } as const;
    const agent = { select: { id: true, displayName: true } } as const;

    const [inquiries, bookings, deals, manual, viewers, site] = await Promise.all([
      this.prisma.inquiry.findMany({
        // Agents also see the inquiries they referred to other developments.
        where: isAgent
          ? { OR: [{ propertyId: { in: propertyIds } }, { agentId: owner.id }] }
          : { propertyId: { in: propertyIds } },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.booking.findMany({
        where: isAgent
          ? { OR: [{ propertyId: { in: propertyIds } }, { agentId: owner.id }] }
          : { propertyId: { in: propertyIds } },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.deal.findMany({
        // An agent's deals are the clients they registered with developers.
        where: isAgent ? { agentId: owner.id } : { developerId: owner.id },
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      this.prisma.developerLead.findMany({
        where: owner.leadWhere,
        include: { property: prop, agent },
        orderBy: { createdAt: 'desc' },
        take: TAKE,
      }),
      // Signed-in buyers who opened a development's page — the same list the
      // analytics page shows. Over a year, so quiet interest is not lost.
      this.analytics.interestedViewers(isAgent ? { agentUserId: userId } : { developerUserId: userId }, VIEWER_DAYS),
      // Forms sent from the agent's own website.
      isAgent
        ? this.prisma.agentSiteLead.findMany({
          where: { agentId: owner.id },
          include: { property: prop },
          orderBy: { createdAt: 'desc' },
          take: TAKE,
        })
        : Promise.resolve([]),
    ]);

    const own = new Set(propertyIds);
    // For an agent, "AGENT" means a client they referred to someone else's
    // development; anything on their own listing is automatic.
    const viaAgent = (agentId: string | null, propertyId: string | null) =>
      isAgent ? !(propertyId && own.has(propertyId)) : !!agentId;

    const rows: LeadRow[] = [
      ...inquiries.map((i): LeadRow => ({
        id: i.id, kind: 'INQUIRY', channel: viaAgent(i.agentId, i.propertyId) ? 'AGENT' : 'AUTOMATIC',
        sourceLabel: viaAgent(i.agentId, i.propertyId) ? (isAgent ? 'Your referral · inquiry' : 'Agent referral · inquiry') : 'Website inquiry',
        name: i.name, email: i.email, phone: i.phone ?? null,
        property: i.property, agent: i.agent, status: i.status,
        interest: i.interestedUnit ?? null, message: i.message, budget: null, addedBy: null, createdAt: i.createdAt,
      })),
      ...bookings.map((b): LeadRow => ({
        id: b.id, kind: 'BOOKING', channel: viaAgent(b.agentId, b.propertyId) ? 'AGENT' : 'AUTOMATIC',
        sourceLabel: `${viaAgent(b.agentId, b.propertyId) ? (isAgent ? 'Your referral · ' : 'Agent referral · ') : ''}${b.type === 'VIRTUAL' ? 'Virtual tour request' : 'Viewing request'}`,
        name: b.name, email: b.email, phone: b.phone ?? null,
        property: b.property, agent: b.agent, status: b.status,
        interest: null, message: b.message ?? null, budget: null, addedBy: null, createdAt: b.createdAt,
      })),
      ...deals.map((d): LeadRow => ({
        id: d.id, kind: 'AGENT_DEAL', channel: 'AGENT', sourceLabel: isAgent ? 'Client you registered' : 'Registered by agent',
        name: d.clientName, email: d.clientEmail ?? null, phone: d.clientPhone ?? null,
        property: d.property, agent: d.agent, status: d.stage,
        interest: null, message: null, budget: null, addedBy: null, createdAt: d.createdAt,
      })),
      // Viewers who already sent an inquiry for that development are listed
      // under it; showing them twice would double-count the same person.
      ...viewers.rows
        .filter((v) => v.user && !v.alreadyLead)
        .map((v): LeadRow => ({
          id: `${v.userId}:${v.propertyId}`, kind: 'VIEWER',
          channel: isAgent && !own.has(v.propertyId) ? 'AGENT' : 'AUTOMATIC',
          sourceLabel: `Opened the page · viewed ${v.views} time${v.views === 1 ? '' : 's'}`,
          name: [v.user!.firstName, v.user!.lastName].filter(Boolean).join(' ') || v.user!.email,
          email: v.user!.email, phone: v.user!.phone ?? null,
          property: v.property, agent: null, status: 'VIEWED',
          interest: null, message: null, budget: null, addedBy: null,
          viewer: { userId: v.userId, propertyId: v.propertyId, views: v.views },
          createdAt: v.lastViewedAt ? new Date(v.lastViewedAt) : new Date(0),
        })),
      ...site.map((l): LeadRow => {
        const d = describeSiteLead(l);
        return {
          id: l.id, kind: 'SITE', channel: 'AUTOMATIC', sourceLabel: `Your website · ${d.label.toLowerCase()}`,
          name: l.name, email: l.email, phone: l.phone,
          property: l.property, agent: null, status: l.status,
          interest: d.interest, message: l.message, budget: null, addedBy: null,
          details: d.details, siteType: l.type, createdAt: l.createdAt,
        };
      }),
      ...manual.map((m): LeadRow => ({
        id: m.id, kind: 'MANUAL', channel: 'MANUAL', sourceLabel: SOURCE_LABEL[m.source] ?? 'Other',
        name: m.name, email: m.email ?? null, phone: m.phone ?? null,
        property: m.property, agent: m.agent, status: m.status,
        interest: m.interest ?? null, message: m.notes ?? null, budget: m.budget ?? null,
        addedBy: m.createdByName ?? null, source: m.source, createdAt: m.createdAt,
      })),
    ].sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());

    return { leads: rows, properties };
  }

  private async assertProperty(owner: LeadOwner, propertyId?: string | null) {
    if (!propertyId) return;
    const ok = await this.prisma.property.count({ where: { id: propertyId, ...owner.propertyWhere } });
    if (!ok) throw new BadRequestException('That development is not one of yours');
  }

  async create(userId: string, author: { id: string; name: string }, dto: CreateLeadDto) {
    const owner = await this.ownerOf(userId);
    if (!dto.email?.trim() && !dto.phone?.trim()) {
      throw new BadRequestException('Add a phone number or an email so the team can reach them');
    }
    await this.assertProperty(owner, dto.propertyId);
    return this.prisma.developerLead.create({
      data: {
        ...owner.leadWhere,
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
    const owner = await this.ownerOf(userId);
    const lead = await this.prisma.developerLead.findFirst({ where: { id, ...owner.leadWhere } });
    if (!lead) throw new NotFoundException('Lead not found');
    return { owner, lead };
  }

  async update(userId: string, id: string, dto: UpdateLeadDto) {
    const { owner, lead } = await this.ownLead(userId, id);
    if (dto.propertyId !== undefined) await this.assertProperty(owner, dto.propertyId);
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
