import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { AgentSiteItemType, KybStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';

/**
 * Website content an agent manages: team, testimonials, past sales, FAQs,
 * services, process steps, journal posts and awards. Each type has a field
 * schema; anything outside it is dropped and every value is trimmed and
 * length-capped before it is stored, so templates can trust what they get.
 */

type Field =
  | { kind: 'text'; max: number; required?: boolean }
  | { kind: 'url'; required?: boolean }
  | { kind: 'number'; min?: number; max?: number; required?: boolean }
  | { kind: 'enum'; options: readonly string[]; required?: boolean }
  | { kind: 'month'; required?: boolean }
  | { kind: 'list'; max: number; itemMax: number };

export const CONTENT_SCHEMA: Record<AgentSiteItemType, Record<string, Field>> = {
  /** A neighbourhood guide with its own page. */
  AREA: {
    name: { kind: 'text', max: 80, required: true },
    tagline: { kind: 'text', max: 140 },
    coverUrl: { kind: 'url' },
    summary: { kind: 'text', max: 400 },
    body: { kind: 'text', max: 20000 },
    highlights: { kind: 'list', max: 8, itemMax: 100 },
    priceFrom: { kind: 'number', min: 0, max: 1e12 },
    rentFrom: { kind: 'number', min: 0, max: 1e10 },
    commute: { kind: 'text', max: 120 },
    schools: { kind: 'list', max: 8, itemMax: 80 },
    /** Matches listings whose neighbourhood or city contains this. */
    match: { kind: 'text', max: 80 },
  },
  /** A deal told as a story: challenge, approach, result. */
  CASE_STUDY: {
    title: { kind: 'text', max: 120, required: true },
    clientType: { kind: 'enum', options: ['BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'INVESTOR', 'DEVELOPER'] },
    location: { kind: 'text', max: 100 },
    coverUrl: { kind: 'url' },
    challenge: { kind: 'text', max: 800 },
    approach: { kind: 'text', max: 1200 },
    result: { kind: 'text', max: 800 },
    metrics: { kind: 'list', max: 4, itemMax: 40 },
    quote: { kind: 'text', max: 400 },
    date: { kind: 'month' },
  },
  /** A landlord / management package with its fee. */
  PACKAGE: {
    name: { kind: 'text', max: 60, required: true },
    fee: { kind: 'text', max: 40, required: true },
    feeNote: { kind: 'text', max: 60 },
    description: { kind: 'text', max: 300 },
    points: { kind: 'list', max: 10, itemMax: 90 },
    featured: { kind: 'enum', options: ['YES', 'NO'] },
  },
  /** An opening on the careers section. */
  ROLE: {
    title: { kind: 'text', max: 100, required: true },
    location: { kind: 'text', max: 80 },
    employment: { kind: 'enum', options: ['FULL_TIME', 'PART_TIME', 'COMMISSION', 'CONTRACT', 'INTERNSHIP'] },
    description: { kind: 'text', max: 2000 },
    requirements: { kind: 'list', max: 8, itemMax: 120 },
  },
  TEAM: {
    name: { kind: 'text', max: 80, required: true },
    role: { kind: 'text', max: 80 },
    photoUrl: { kind: 'url' },
    bio: { kind: 'text', max: 800 },
    phone: { kind: 'text', max: 30 },
    email: { kind: 'text', max: 120 },
    years: { kind: 'number', min: 0, max: 80 },
    sales: { kind: 'number', min: 0, max: 100000 },
    linkedin: { kind: 'url' },
  },
  TESTIMONIAL: {
    quote: { kind: 'text', max: 600, required: true },
    author: { kind: 'text', max: 80, required: true },
    context: { kind: 'text', max: 100 },
    dealType: { kind: 'enum', options: ['BUYER', 'SELLER', 'TENANT', 'LANDLORD', 'INVESTOR'] },
    rating: { kind: 'number', min: 1, max: 5 },
    photoUrl: { kind: 'url' },
    date: { kind: 'month' },
  },
  PAST_SALE: {
    title: { kind: 'text', max: 100, required: true },
    location: { kind: 'text', max: 100 },
    outcome: { kind: 'enum', options: ['SOLD', 'LET'], required: true },
    price: { kind: 'number', min: 0, max: 1e12 },
    currency: { kind: 'text', max: 3 },
    date: { kind: 'month' },
    imageUrl: { kind: 'url' },
    note: { kind: 'text', max: 300 },
  },
  FAQ: {
    question: { kind: 'text', max: 200, required: true },
    answer: { kind: 'text', max: 1500, required: true },
  },
  SERVICE: {
    title: { kind: 'text', max: 80, required: true },
    description: { kind: 'text', max: 500 },
    points: { kind: 'list', max: 6, itemMax: 80 },
    imageUrl: { kind: 'url' },
  },
  STEP: {
    title: { kind: 'text', max: 80, required: true },
    description: { kind: 'text', max: 300 },
    audience: { kind: 'enum', options: ['ALL', 'BUYERS', 'SELLERS'] },
  },
  POST: {
    title: { kind: 'text', max: 140, required: true },
    category: { kind: 'text', max: 40 },
    coverUrl: { kind: 'url' },
    excerpt: { kind: 'text', max: 300 },
    body: { kind: 'text', max: 30000, required: true },
    publishedAt: { kind: 'month' },
  },
  AWARD: {
    title: { kind: 'text', max: 100, required: true },
    issuer: { kind: 'text', max: 100 },
    year: { kind: 'number', min: 1950, max: 2100 },
  },
};

const MAX_PER_TYPE = 60;
/** Types with their own page on the site, so they need a link. */
const SLUGGED: AgentSiteItemType[] = ['POST', 'AREA'];

function clean(type: AgentSiteItemType, raw: unknown) {
  const input = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  for (const [key, f] of Object.entries(CONTENT_SCHEMA[type])) {
    const v = input[key];
    const empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (empty) {
      if ('required' in f && f.required) throw new BadRequestException(`${key} is required`);
      continue;
    }
    switch (f.kind) {
      case 'text': out[key] = String(v).trim().slice(0, f.max); break;
      case 'url': {
        const s = String(v).trim();
        if (!/^https?:\/\/\S+$/i.test(s)) throw new BadRequestException(`${key} must be a link starting with https://`);
        out[key] = s.slice(0, 1000); break;
      }
      case 'number': {
        const n = Number(v);
        if (!Number.isFinite(n)) throw new BadRequestException(`${key} must be a number`);
        out[key] = Math.min(f.max ?? n, Math.max(f.min ?? n, n)); break;
      }
      case 'enum':
        if (!f.options.includes(String(v))) throw new BadRequestException(`${key} must be one of ${f.options.join(', ')}`);
        out[key] = String(v); break;
      case 'month': {
        const s = String(v).trim();
        if (!/^\d{4}-(0[1-9]|1[0-2])(-\d{2})?$/.test(s)) throw new BadRequestException(`${key} must be a date like 2026-05`);
        out[key] = s.slice(0, 7); break;
      }
      case 'list': {
        const arr = Array.isArray(v) ? v : String(v).split('\n');
        out[key] = arr.map((x) => String(x).trim().slice(0, f.itemMax)).filter(Boolean).slice(0, f.max); break;
      }
    }
  }
  if (type === 'PAST_SALE' && out.currency) out.currency = String(out.currency).toUpperCase();
  return out;
}

function slugify(s: string) {
  return s.toLowerCase().normalize('NFKD').replace(/[^\w\s-]/g, '').trim().replace(/[\s_-]+/g, '-').slice(0, 80) || 'post';
}

@Injectable()
export class AgentSiteContentService {
  constructor(private readonly prisma: PrismaService) {}

  private async agentOf(userId: string) {
    const a = await this.prisma.agentProfile.findUnique({ where: { userId }, select: { id: true, siteLicenceNo: true, siteFooterNote: true } });
    if (!a) throw new ForbiddenException('Agent profile required');
    return a;
  }

  private shape(i: { id: string; type: AgentSiteItemType; data: Prisma.JsonValue; slug: string | null; isPublished: boolean; sortOrder: number; updatedAt: Date }) {
    return { id: i.id, type: i.type, data: i.data as Record<string, unknown>, slug: i.slug, isPublished: i.isPublished, sortOrder: i.sortOrder, updatedAt: i.updatedAt };
  }

  async mine(userId: string) {
    const a = await this.agentOf(userId);
    const items = await this.prisma.agentSiteItem.findMany({ where: { agentId: a.id }, orderBy: [{ type: 'asc' }, { sortOrder: 'asc' }, { createdAt: 'asc' }] });
    return { licenceNo: a.siteLicenceNo, footerNote: a.siteFooterNote, items: items.map((i) => this.shape(i)) };
  }

  private async uniqueSlug(agentId: string, title: string, exceptId?: string) {
    const base = slugify(title);
    for (let n = 0; n < 50; n++) {
      const slug = n ? `${base}-${n + 1}` : base;
      const clash = await this.prisma.agentSiteItem.findFirst({ where: { agentId, slug, ...(exceptId && { NOT: { id: exceptId } }) }, select: { id: true } });
      if (!clash) return slug;
    }
    return `${base}-${Date.now().toString(36)}`;
  }

  async create(userId: string, type: AgentSiteItemType, data: unknown, isPublished = true) {
    const a = await this.agentOf(userId);
    if (!CONTENT_SCHEMA[type]) throw new BadRequestException('Unknown content type');
    const count = await this.prisma.agentSiteItem.count({ where: { agentId: a.id, type } });
    if (count >= MAX_PER_TYPE) throw new BadRequestException(`You can add up to ${MAX_PER_TYPE} of these`);
    const d = clean(type, data);
    await this.prisma.agentSiteItem.create({
      data: {
        agentId: a.id, type, data: d as Prisma.InputJsonValue, isPublished, sortOrder: count,
        ...(SLUGGED.includes(type) && { slug: await this.uniqueSlug(a.id, String(d.title ?? d.name)) }),
      },
    });
    return this.mine(userId);
  }

  async update(userId: string, id: string, dto: { data?: unknown; isPublished?: boolean }) {
    const a = await this.agentOf(userId);
    const item = await this.prisma.agentSiteItem.findFirst({ where: { id, agentId: a.id } });
    if (!item) throw new NotFoundException('Item not found');
    const d = dto.data !== undefined ? clean(item.type, dto.data) : undefined;
    await this.prisma.agentSiteItem.update({
      where: { id },
      data: {
        ...(d && { data: d as Prisma.InputJsonValue }),
        ...(dto.isPublished !== undefined && { isPublished: dto.isPublished }),
        // A post keeps its link once published unless the title changes before anyone could share it.
        ...(d && SLUGGED.includes(item.type) && (!item.isPublished || !item.slug) && { slug: await this.uniqueSlug(a.id, String(d.title ?? d.name), id) }),
      },
    });
    return this.mine(userId);
  }

  async remove(userId: string, id: string) {
    const a = await this.agentOf(userId);
    const r = await this.prisma.agentSiteItem.deleteMany({ where: { id, agentId: a.id } });
    if (!r.count) throw new NotFoundException('Item not found');
    return this.mine(userId);
  }

  /** Set the order of one type's items to the order of `ids`. */
  async reorder(userId: string, type: AgentSiteItemType, ids: string[]) {
    const a = await this.agentOf(userId);
    const items = await this.prisma.agentSiteItem.findMany({ where: { agentId: a.id, type }, select: { id: true } });
    const known = new Set(items.map((i) => i.id));
    const order = ids.filter((id) => known.has(id));
    await this.prisma.$transaction(order.map((id, i) => this.prisma.agentSiteItem.update({ where: { id }, data: { sortOrder: i } })));
    return this.mine(userId);
  }

  async updateLegal(userId: string, dto: { licenceNo?: string | null; footerNote?: string | null }) {
    const a = await this.agentOf(userId);
    await this.prisma.agentProfile.update({
      where: { id: a.id },
      data: {
        ...(dto.licenceNo !== undefined && { siteLicenceNo: dto.licenceNo?.trim().slice(0, 120) || null }),
        ...(dto.footerNote !== undefined && { siteFooterNote: dto.footerNote?.trim().slice(0, 500) || null }),
      },
    });
    return this.mine(userId);
  }

  // ─── Public ─────────────────────────────────────────────────────────────

  /** Published content grouped for templates. Post bodies are left out (they load on their own page). */
  async forSite(agentId: string) {
    const items = await this.prisma.agentSiteItem.findMany({
      where: { agentId, isPublished: true },
      orderBy: [{ sortOrder: 'asc' }, { createdAt: 'asc' }],
    });
    const of = (t: AgentSiteItemType) => items.filter((i) => i.type === t).map((i) => ({ id: i.id, ...(i.data as Record<string, unknown>) }));
    const posts = items.filter((i) => i.type === 'POST').map((i) => {
      const { body, ...rest } = i.data as Record<string, unknown>;
      const words = String(body ?? '').split(/\s+/).filter(Boolean).length;
      return {
        id: i.id, slug: i.slug, ...rest, readMinutes: Math.max(1, Math.round(words / 220)),
        excerpt: rest.excerpt ?? String(body ?? '').slice(0, 200),
      } as Record<string, unknown> & { publishedAt?: string };
    }).sort((x, y) => String(y.publishedAt ?? '').localeCompare(String(x.publishedAt ?? '')));
    const guides = items.filter((i) => i.type === 'AREA').map((i) => {
      const { body, ...rest } = i.data as Record<string, unknown>;
      return { id: i.id, slug: i.slug, ...rest, hasPage: !!String(body ?? '').trim() };
    });
    return {
      guides, cases: of('CASE_STUDY'), packages: of('PACKAGE'),
      team: of('TEAM'), testimonials: of('TESTIMONIAL'), sold: of('PAST_SALE'), faqs: of('FAQ'),
      services: of('SERVICE'), steps: of('STEP'), awards: of('AWARD'), roles: of('ROLE'), posts,
    };
  }

  async areaForOwner(userId: string, slug: string) {
    const a = await this.agentOf(userId);
    return this.area(a.id, slug, true);
  }

  /** One area guide page. */
  async area(agentId: string, slug: string, preview = false) {
    const a = await this.prisma.agentProfile.findFirst({
      where: { id: agentId, ...(preview ? {} : { kybStatus: KybStatus.APPROVED, isListed: true }) },
      select: { id: true },
    });
    if (!a) throw new NotFoundException('Not found');
    const i = await this.prisma.agentSiteItem.findFirst({ where: { agentId, type: 'AREA', slug, ...(preview ? {} : { isPublished: true }) } });
    if (!i) throw new NotFoundException('Area not found');
    return { id: i.id, slug: i.slug, ...(i.data as Record<string, unknown>) };
  }

  async postForOwner(userId: string, slug: string) {
    const a = await this.agentOf(userId);
    return this.post(a.id, slug, true);
  }

  async post(agentId: string, slug: string, preview = false) {
    const a = await this.prisma.agentProfile.findFirst({
      where: { id: agentId, ...(preview ? {} : { kybStatus: KybStatus.APPROVED, isListed: true }) },
      select: { id: true },
    });
    if (!a) throw new NotFoundException('Not found');
    const i = await this.prisma.agentSiteItem.findFirst({ where: { agentId, type: 'POST', slug, ...(preview ? {} : { isPublished: true }) } });
    if (!i) throw new NotFoundException('Post not found');
    const d = i.data as Record<string, unknown>;
    const words = String(d.body ?? '').split(/\s+/).filter(Boolean).length;
    return { id: i.id, slug: i.slug, ...d, readMinutes: Math.max(1, Math.round(words / 220)) };
  }
}
