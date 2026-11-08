import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentSiteLeadType, KybStatus, LeadStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';

/**
 * Forms on an agent's website — contact, valuation request, viewing booking,
 * job application, newsletter — and the leads they create. Every answer is
 * checked against a fixed list or capped in length before it is stored, and
 * the agent hears about each one straight away.
 */

export type ViewingMode = 'IN_PERSON' | 'VIDEO';

export interface SiteForms {
  contact: boolean;
  valuation: boolean;
  viewing: boolean;
  newsletter: boolean;
  careers: boolean;
  /** Days viewings can be booked, 0 = Sunday. */
  days: number[];
  /** Viewing hours, "HH:MM" Nairobi time. */
  start: string;
  end: string;
  slotMinutes: number;
  modes: ViewingMode[];
  /** How far ahead a slot must be to be bookable. */
  noticeHours: number;
}

export const DEFAULT_FORMS: SiteForms = {
  contact: true, valuation: true, viewing: true, newsletter: true, careers: true,
  days: [1, 2, 3, 4, 5, 6], start: '09:00', end: '17:00', slotMinutes: 60, modes: ['IN_PERSON', 'VIDEO'], noticeHours: 4,
};

/** Nairobi is UTC+3 all year (no daylight saving). */
const TZ_OFFSET_MIN = 180;
const DAYS_AHEAD = 14;
const SLOT_CHOICES = [30, 45, 60, 90, 120];

const INTENTS = ['BUY', 'RENT', 'SELL', 'LET', 'INVEST', 'OTHER'] as const;
const TIMEFRAMES = ['NOW', 'THREE_MONTHS', 'SIX_MONTHS', 'LATER'] as const;
const PROPERTY_TYPES = ['APARTMENT', 'HOUSE', 'VILLA', 'TOWNHOUSE', 'LAND', 'COMMERCIAL', 'OTHER'] as const;

const LABEL: Record<string, string> = {
  BUY: 'Buy', RENT: 'Rent', SELL: 'Sell', LET: 'Let out', INVEST: 'Invest', OTHER: 'Other',
  NOW: 'Right away', THREE_MONTHS: 'Within 3 months', SIX_MONTHS: 'Within 6 months', LATER: 'Just looking',
  APARTMENT: 'Apartment', HOUSE: 'House', VILLA: 'Villa', TOWNHOUSE: 'Townhouse', LAND: 'Land', COMMERCIAL: 'Commercial',
  IN_PERSON: 'In person', VIDEO: 'Video call',
};

export const SITE_LEAD_LABEL: Record<AgentSiteLeadType, string> = {
  CONTACT: 'Website message',
  VALUATION: 'Valuation request',
  VIEWING: 'Viewing booking',
  CAREER: 'Job application',
  NEWSLETTER: 'Newsletter sign-up',
};

export interface SubmitInput {
  type: AgentSiteLeadType;
  name?: string;
  email?: string;
  phone?: string;
  message?: string;
  propertyId?: string;
  slotAt?: string;
  data?: Record<string, unknown>;
  /** Honeypot: people never see this field, bots fill it in. */
  website?: string;
}

const str = (v: unknown, max: number) => (typeof v === 'string' || typeof v === 'number' ? String(v).trim().slice(0, max) : '');
const oneOf = <T extends readonly string[]>(v: unknown, list: T): T[number] | undefined =>
  list.includes(String(v)) ? (String(v) as T[number]) : undefined;
const num = (v: unknown, min: number, max: number) => {
  if (v === undefined || v === null || v === '') return undefined;
  const n = Number(String(v).replace(/[,\s]/g, ''));
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : undefined;
};
const url = (v: unknown) => {
  const s = str(v, 1000);
  if (!s) return undefined;
  if (!/^https?:\/\/\S+$/i.test(s)) throw new BadRequestException('Links must start with https://');
  return s;
};
const hhmm = (s: string) => {
  const m = /^([01]\d|2[0-3]):([0-5]\d)$/.exec(s);
  return m ? Number(m[1]) * 60 + Number(m[2]) : null;
};

/** Day/time parts of a UTC instant, read in Nairobi time. */
function local(d: Date) {
  const t = new Date(d.getTime() + TZ_OFFSET_MIN * 60_000);
  return { y: t.getUTCFullYear(), m: t.getUTCMonth(), d: t.getUTCDate(), dow: t.getUTCDay(), min: t.getUTCHours() * 60 + t.getUTCMinutes() };
}
/** The UTC instant for a Nairobi wall-clock time. */
function fromLocal(y: number, m: number, d: number, minutes: number) {
  return new Date(Date.UTC(y, m, d, 0, minutes) - TZ_OFFSET_MIN * 60_000);
}

export function readForms(raw: unknown): SiteForms {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Partial<SiteForms>;
  const bool = (k: keyof SiteForms) => (typeof r[k] === 'boolean' ? (r[k] as boolean) : (DEFAULT_FORMS[k] as boolean));
  const days = Array.isArray(r.days) ? [...new Set(r.days.map(Number).filter((n) => n >= 0 && n <= 6))].sort() : DEFAULT_FORMS.days;
  const start = typeof r.start === 'string' && hhmm(r.start) !== null ? r.start : DEFAULT_FORMS.start;
  let end = typeof r.end === 'string' && hhmm(r.end) !== null ? r.end : DEFAULT_FORMS.end;
  if (hhmm(end)! <= hhmm(start)!) end = DEFAULT_FORMS.end > start ? DEFAULT_FORMS.end : '23:00';
  const modes = Array.isArray(r.modes) ? r.modes.filter((m): m is ViewingMode => m === 'IN_PERSON' || m === 'VIDEO') : DEFAULT_FORMS.modes;
  return {
    contact: bool('contact'), valuation: bool('valuation'), viewing: bool('viewing'), newsletter: bool('newsletter'), careers: bool('careers'),
    days, start, end,
    slotMinutes: SLOT_CHOICES.includes(Number(r.slotMinutes)) ? Number(r.slotMinutes) : DEFAULT_FORMS.slotMinutes,
    modes: modes.length ? [...new Set(modes)] : DEFAULT_FORMS.modes,
    noticeHours: num(r.noticeHours, 0, 168) ?? DEFAULT_FORMS.noticeHours,
  };
}

/** What a visitor's site needs to know about the forms (nothing private). */
export function publicForms(f: SiteForms) {
  return {
    contact: f.contact, valuation: f.valuation, viewing: f.viewing && f.days.length > 0, newsletter: f.newsletter, careers: f.careers,
    modes: f.modes, slotMinutes: f.slotMinutes,
  };
}

type LeadRecord = Prisma.AgentSiteLeadGetPayload<{ include: { property: { select: { id: true; name: true; slug: true } } } }>;

/** A site lead as the Leads page lists it: a summary line and its answers. */
export function describeSiteLead(l: Pick<LeadRecord, 'type' | 'data' | 'slotAt' | 'message'>) {
  const d = (l.data ?? {}) as Record<string, unknown>;
  const rows: { label: string; value: string }[] = [];
  const add = (label: string, v: unknown) => { if (v !== undefined && v !== null && v !== '') rows.push({ label, value: String(v) }); };
  const when = l.slotAt
    ? l.slotAt.toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
    : undefined;
  let interest: string | null = null;
  switch (l.type) {
    case 'CONTACT':
      add('Looking to', LABEL[String(d.intent)]);
      add('Timeframe', LABEL[String(d.timeframe)]);
      add('Area', d.area);
      add('Budget', d.budget ? Number(d.budget).toLocaleString('en-KE') : undefined);
      if (Array.isArray(d.listings) && d.listings.length) add('Saved homes', (d.listings as { name: string }[]).map((x) => x.name).join(', '));
      interest = [LABEL[String(d.intent)], d.area].filter(Boolean).join(' · ') || null;
      break;
    case 'VALUATION':
      add('Property', d.address);
      add('Type', LABEL[String(d.propertyType)]);
      add('Bedrooms', d.bedrooms);
      add('Wants to', LABEL[String(d.purpose)]);
      add('Timeframe', LABEL[String(d.timeframe)]);
      interest = [LABEL[String(d.purpose)] ? `${LABEL[String(d.purpose)]}:` : null, d.address].filter(Boolean).join(' ') || null;
      break;
    case 'VIEWING':
      add('When', when);
      add('How', LABEL[String(d.mode)]);
      interest = [when, LABEL[String(d.mode)]].filter(Boolean).join(' · ') || null;
      break;
    case 'CAREER':
      add('Role', d.roleTitle);
      add('Experience', d.experience !== undefined ? `${d.experience} years` : undefined);
      add('LinkedIn', d.linkedin);
      add('CV', d.cvUrl);
      interest = d.roleTitle ? String(d.roleTitle) : null;
      break;
    case 'NEWSLETTER':
      interest = 'Newsletter';
      break;
  }
  if (l.message) add('Message', l.message);
  return { label: SITE_LEAD_LABEL[l.type], interest, details: rows };
}

@Injectable()
export class AgentSiteLeadsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  private async agentOf(userId: string) {
    const a = await this.prisma.agentProfile.findUnique({ where: { userId }, select: { id: true, siteForms: true } });
    if (!a) throw new ForbiddenException('Agent profile required');
    return a;
  }

  // ─── Settings ───────────────────────────────────────────────────────────

  async forms(userId: string) {
    const a = await this.agentOf(userId);
    return readForms(a.siteForms);
  }

  async saveForms(userId: string, input: Partial<SiteForms>) {
    const a = await this.agentOf(userId);
    const next = readForms({ ...readForms(a.siteForms), ...input });
    await this.prisma.agentProfile.update({ where: { id: a.id }, data: { siteForms: next as unknown as Prisma.InputJsonValue } });
    return next;
  }

  // ─── Viewing slots ──────────────────────────────────────────────────────

  private async liveAgent(agentId: string) {
    const a = await this.prisma.agentProfile.findFirst({
      where: { id: agentId, kybStatus: KybStatus.APPROVED, isListed: true },
      select: { id: true, userId: true, displayName: true, siteForms: true },
    });
    if (!a) throw new NotFoundException('Agent not found');
    return a;
  }

  /** Every slot in the next two weeks, minus the past, the too-soon and the taken. */
  private async openSlots(agentId: string, f: SiteForms) {
    const now = new Date();
    const earliest = now.getTime() + f.noticeHours * 3_600_000;
    const start = hhmm(f.start)!;
    const end = hhmm(f.end)!;
    const horizon = new Date(now.getTime() + (DAYS_AHEAD + 1) * 86_400_000);
    const taken = await this.prisma.agentSiteLead.findMany({
      where: { agentId, type: 'VIEWING', slotAt: { gte: now, lte: horizon }, status: { not: LeadStatus.LOST } },
      select: { slotAt: true },
    });
    const busy = new Set(taken.map((t) => t.slotAt!.getTime()));
    const today = local(now);
    const days: { date: string; label: string; slots: { at: string; label: string }[] }[] = [];
    for (let i = 0; i < DAYS_AHEAD; i++) {
      const noon = fromLocal(today.y, today.m, today.d + i, 12 * 60);
      const day = local(noon);
      if (!f.days.includes(day.dow)) continue;
      const slots: { at: string; label: string }[] = [];
      for (let m = start; m + f.slotMinutes <= end; m += f.slotMinutes) {
        const at = fromLocal(day.y, day.m, day.d, m);
        if (at.getTime() < earliest || busy.has(at.getTime())) continue;
        slots.push({ at: at.toISOString(), label: `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}` });
      }
      if (slots.length) {
        days.push({
          date: `${day.y}-${String(day.m + 1).padStart(2, '0')}-${String(day.d).padStart(2, '0')}`,
          label: noon.toLocaleDateString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'short', day: 'numeric', month: 'short' }),
          slots,
        });
      }
    }
    return days;
  }

  async slots(agentId: string) {
    const a = await this.liveAgent(agentId);
    const f = readForms(a.siteForms);
    if (!f.viewing) return { days: [], modes: f.modes };
    return { days: await this.openSlots(a.id, f), modes: f.modes, slotMinutes: f.slotMinutes };
  }

  /** Owner preview: the same slots, whether or not the site is live yet. */
  async slotsForOwner(userId: string) {
    const a = await this.agentOf(userId);
    const f = readForms(a.siteForms);
    if (!f.viewing) return { days: [], modes: f.modes };
    return { days: await this.openSlots(a.id, f), modes: f.modes, slotMinutes: f.slotMinutes };
  }

  // ─── Submissions ────────────────────────────────────────────────────────

  /** Developments the site shows: the agent's own live listings and active partnerships. */
  private async siteListingIds(agentId: string) {
    const LIVE = { in: ['ACTIVE', 'OFF_PLAN'] as never[] };
    const [own, assigned] = await Promise.all([
      this.prisma.property.findMany({ where: { listedByAgentId: agentId, status: LIVE }, select: { id: true, name: true } }),
      this.prisma.propertyAssignment.findMany({
        where: { isActive: true, partnership: { agentId, status: 'ACTIVE' }, property: { status: LIVE } },
        select: { property: { select: { id: true, name: true } } },
      }),
    ]);
    return new Map([...own, ...assigned.map((x) => x.property)].map((p) => [p.id, p.name]));
  }

  async submit(agentId: string, input: SubmitInput) {
    // A filled honeypot gets the same answer as a real send, so bots learn nothing.
    if (input.website && input.website.trim()) return { ok: true };

    const a = await this.liveAgent(agentId);
    const f = readForms(a.siteForms);
    const type = input.type;
    const enabled: Record<AgentSiteLeadType, boolean> = {
      CONTACT: f.contact, VALUATION: f.valuation, VIEWING: f.viewing, CAREER: f.careers, NEWSLETTER: f.newsletter,
    };
    if (!enabled[type]) throw new BadRequestException('This form is switched off');

    const email = str(input.email, 160).toLowerCase() || null;
    const phone = str(input.phone, 30) || null;
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new BadRequestException('Check the email address');
    if (phone && !/^[+\d][\d\s()-]{6,}$/.test(phone)) throw new BadRequestException('Check the phone number');
    const message = str(input.message, 2000) || null;
    const raw = input.data ?? {};
    let name = str(input.name, 100);

    if (type === 'NEWSLETTER') {
      if (!email) throw new BadRequestException('Add your email to subscribe');
      const existing = await this.prisma.agentSiteLead.findFirst({ where: { agentId: a.id, type, email } });
      if (existing) return { ok: true };
      name ||= email.split('@')[0];
    } else {
      if (!name) throw new BadRequestException('Add your name');
      if (!email && !phone) throw new BadRequestException('Add a phone number or an email so we can reach you');
    }

    let propertyId: string | null = null;
    let propertyName: string | null = null;
    if (input.propertyId) {
      const ids = await this.siteListingIds(a.id);
      if (ids.has(input.propertyId)) { propertyId = input.propertyId; propertyName = ids.get(input.propertyId)!; }
    }

    const data: Record<string, unknown> = {};
    let slotAt: Date | null = null;
    switch (type) {
      case 'CONTACT': {
        data.intent = oneOf(raw.intent, INTENTS);
        data.timeframe = oneOf(raw.timeframe, TIMEFRAMES);
        data.area = str(raw.area, 80) || undefined;
        data.budget = num(raw.budget, 0, 1e12);
        if (Array.isArray(raw.listingIds) && raw.listingIds.length) {
          const ids = await this.siteListingIds(a.id);
          data.listings = raw.listingIds.slice(0, 30).map(String).filter((id) => ids.has(id)).map((id) => ({ id, name: ids.get(id) }));
        }
        if (!message && !data.intent && !(data.listings as unknown[] | undefined)?.length) throw new BadRequestException('Tell us a little about what you need');
        break;
      }
      case 'VALUATION': {
        data.address = str(raw.address, 200);
        if (!data.address) throw new BadRequestException('Add the property’s location');
        data.propertyType = oneOf(raw.propertyType, PROPERTY_TYPES);
        data.bedrooms = num(raw.bedrooms, 0, 20);
        data.purpose = oneOf(raw.purpose, ['SELL', 'LET'] as const) ?? 'SELL';
        data.timeframe = oneOf(raw.timeframe, TIMEFRAMES);
        break;
      }
      case 'VIEWING': {
        const at = input.slotAt ? new Date(input.slotAt) : null;
        if (!at || Number.isNaN(at.getTime())) throw new BadRequestException('Pick a day and time');
        const open = (await this.openSlots(a.id, f)).some((d) => d.slots.some((s) => new Date(s.at).getTime() === at.getTime()));
        if (!open) throw new BadRequestException('That time was just taken or is no longer available. Pick another.');
        slotAt = at;
        data.mode = oneOf(raw.mode, ['IN_PERSON', 'VIDEO'] as const) ?? f.modes[0];
        if (!f.modes.includes(data.mode as ViewingMode)) data.mode = f.modes[0];
        break;
      }
      case 'CAREER': {
        const roleId = str(raw.roleId, 40);
        const role = roleId
          ? await this.prisma.agentSiteItem.findFirst({ where: { id: roleId, agentId: a.id, type: 'ROLE', isPublished: true } })
          : null;
        data.roleTitle = role ? (role.data as { title?: string }).title : 'Open application';
        data.experience = num(raw.experience, 0, 60);
        data.linkedin = url(raw.linkedin);
        data.cvUrl = url(raw.cvUrl);
        break;
      }
    }
    for (const k of Object.keys(data)) if (data[k] === undefined) delete data[k];

    const lead = await this.prisma.agentSiteLead.create({
      data: {
        agentId: a.id, type, name, email, phone, message, propertyId, slotAt,
        data: data as Prisma.InputJsonValue,
      },
    });

    const summary = describeSiteLead(lead);
    const about = propertyName ? ` about ${propertyName}` : '';
    const titles: Record<AgentSiteLeadType, string> = {
      CONTACT: `New message from ${name}`,
      VALUATION: `Valuation request from ${name}`,
      VIEWING: `Viewing booked by ${name}`,
      CAREER: `${name} applied — ${data.roleTitle}`,
      NEWSLETTER: 'New newsletter subscriber',
    };
    const body = type === 'NEWSLETTER'
      ? `${email} subscribed on your website.`
      : `${name} sent this from your website${about}. ${summary.interest ?? ''}`.trim() + (phone || email ? ` Reach them on ${[phone, email].filter(Boolean).join(' or ')}.` : '');
    await this.events.agentSiteLead(a.userId, titles[type], body, lead.id, type !== 'NEWSLETTER');

    if (type === 'VIEWING' && email && slotAt) {
      const when = slotAt.toLocaleString('en-GB', { timeZone: 'Africa/Nairobi', weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' });
      await this.events.siteVisitorNotice(
        email,
        `Viewing requested with ${a.displayName}`,
        `Hi ${name}, your ${data.mode === 'VIDEO' ? 'video viewing' : 'viewing'}${about} is requested for ${when} (Nairobi time). ${a.displayName} will confirm with you shortly.`,
      );
    }
    return { ok: true };
  }

  // ─── Agent actions on a lead ────────────────────────────────────────────

  private async ownLead(userId: string, id: string) {
    const a = await this.agentOf(userId);
    const lead = await this.prisma.agentSiteLead.findFirst({ where: { id, agentId: a.id } });
    if (!lead) throw new NotFoundException('Lead not found');
    return lead;
  }

  async setStatus(userId: string, id: string, status: LeadStatus) {
    await this.ownLead(userId, id);
    return this.prisma.agentSiteLead.update({ where: { id }, data: { status }, select: { id: true, status: true } });
  }

  async remove(userId: string, id: string) {
    await this.ownLead(userId, id);
    await this.prisma.agentSiteLead.delete({ where: { id } });
    return { message: 'Deleted' };
  }

  /** Newsletter subscribers, for export. */
  async subscribers(userId: string) {
    const a = await this.agentOf(userId);
    return this.prisma.agentSiteLead.findMany({
      where: { agentId: a.id, type: 'NEWSLETTER' },
      orderBy: { createdAt: 'desc' },
      select: { email: true, name: true, createdAt: true },
    });
  }
}
