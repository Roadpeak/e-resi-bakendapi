import {
  BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException, OnModuleInit,
} from '@nestjs/common';
import { createHash } from 'node:crypto';
import type { Invoice, Prisma, PropertyCategory } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { InvoicesService } from '../billing/invoices.service.js';
import { NotificationsService } from '../notifications/notifications.service.js';
import type { CommentDto, CreateReelDto, FeedQueryDto, UpdateReelDto } from './dto/reels.dto.js';

/**
 * Property reels: short vertical videos by agents and developers, each
 * optionally linked to a property for sale or a rental. A paid add-on —
 * creating reels needs a one-time unlock, priced in admin settings.
 */

const UNLOCK_NOTE = 'reels-unlock:';
const SETTINGS = [
  { key: 'reels_unlock_fee', value: '49', valueType: 'number', label: 'Property reels — unlock fee', description: 'One-time fee for an agent or developer to start posting reels. 0 makes it free.' },
];

type Viewer = { userId?: string | null; visitorId?: string | null };

const OWNER_SELECT = {
  agent: { select: { id: true, displayName: true, photoUrl: true, logoUrl: true, kind: true } },
  developer: { select: { id: true, companyName: true, logoUrl: true } },
  property: { select: { id: true, slug: true, name: true, priceFrom: true, currency: true, heroImageUrl: true } },
  rentListing: { select: { id: true, slug: true, name: true, priceFrom: true, currency: true, heroImageUrl: true } },
} as const;

type ReelRow = Prisma.ReelGetPayload<{ include: typeof OWNER_SELECT }>;

@Injectable()
export class ReelsService implements OnModuleInit {
  private readonly logger = new Logger(ReelsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly invoices: InvoicesService,
    private readonly notifications: NotificationsService,
  ) {}

  async onModuleInit() {
    for (const s of SETTINGS) {
      await this.prisma.platformSetting.upsert({ where: { key: s.key }, update: {}, create: { ...s, group: 'billing' } })
        .catch((e) => this.logger.warn(`Setting ${s.key}: ${(e as Error).message}`));
    }
    this.invoices.onPaid('REELS_UNLOCK', (inv) => this.fulfil(inv));
  }

  // ─── Owner identity and the unlock ────────────────────────────────────────

  private async ownerOf(userId: string) {
    const agent = await this.prisma.agentProfile.findUnique({
      where: { userId }, select: { id: true, reelsUnlockedAt: true, reelsInvoiceId: true },
    });
    if (agent) return { kind: 'AGENT' as const, ...agent };
    const dev = await this.prisma.developerProfile.findUnique({
      where: { userId }, select: { id: true, reelsUnlockedAt: true, reelsInvoiceId: true },
    });
    if (dev) return { kind: 'DEVELOPER' as const, ...dev };
    throw new ForbiddenException('Reels are for agents and developers');
  }

  private async fee() {
    const n = Number(await this.pricing.getSetting('reels_unlock_fee', '49'));
    return Number.isFinite(n) && n > 0 ? n : 0;
  }

  private async markUnlocked(kind: 'AGENT' | 'DEVELOPER', id: string, invoiceId?: string) {
    const data = { reelsUnlockedAt: new Date(), ...(invoiceId && { reelsInvoiceId: invoiceId }) };
    if (kind === 'AGENT') await this.prisma.agentProfile.update({ where: { id }, data });
    else await this.prisma.developerProfile.update({ where: { id }, data });
  }

  async state(userId: string) {
    const o = await this.ownerOf(userId);
    const [price, currency] = await Promise.all([this.fee(), this.pricing.platformCurrency()]);
    // Made free after they were invoiced: they are in.
    if (!o.reelsUnlockedAt && price === 0) {
      await this.markUnlocked(o.kind, o.id);
      return { unlocked: true, price, currency, invoice: null };
    }
    const invoice = !o.reelsUnlockedAt && o.reelsInvoiceId
      ? await this.prisma.invoice.findFirst({
        where: { id: o.reelsInvoiceId, status: { in: ['ISSUED', 'OVERDUE'] } },
        select: { id: true, number: true, total: true, currency: true, status: true },
      })
      : null;
    return { unlocked: !!o.reelsUnlockedAt, price, currency, invoice };
  }

  async unlock(userId: string) {
    const o = await this.ownerOf(userId);
    if (o.reelsUnlockedAt) return this.state(userId);
    const price = await this.fee();
    if (price === 0) {
      await this.markUnlocked(o.kind, o.id);
      return this.state(userId);
    }
    if (o.reelsInvoiceId) {
      const open = await this.prisma.invoice.findFirst({ where: { id: o.reelsInvoiceId, status: { in: ['ISSUED', 'OVERDUE'] } }, select: { id: true } });
      if (open) return this.state(userId);
    }
    const currency = await this.pricing.platformCurrency();
    const inv = await this.invoices.create({
      userId, kind: 'REELS_UNLOCK', currency, sendNow: true,
      lines: [{ description: 'Property reels — one-time unlock', quantity: 1, unitAmount: price, amount: price }],
      dueAt: new Date(Date.now() + 7 * 86_400_000),
      notes: `${UNLOCK_NOTE}${o.kind}:${o.id}`,
    });
    if (o.kind === 'AGENT') await this.prisma.agentProfile.update({ where: { id: o.id }, data: { reelsInvoiceId: inv.id } });
    else await this.prisma.developerProfile.update({ where: { id: o.id }, data: { reelsInvoiceId: inv.id } });
    return this.state(userId);
  }

  private async fulfil(inv: Invoice) {
    const [kind, id] = (inv.notes?.split(UNLOCK_NOTE)[1] ?? '').trim().split(/\s/)[0]?.split(':') ?? [];
    if ((kind === 'AGENT' || kind === 'DEVELOPER') && id) {
      await this.markUnlocked(kind, id, inv.id).catch((e) => this.logger.warn(`Reels unlock ${id}: ${(e as Error).message}`));
    }
  }

  // ─── Owner: listings they can link, and their reels ───────────────────────

  async linkable(userId: string) {
    const o = await this.ownerOf(userId);
    const propSel = { id: true, slug: true, name: true, city: true, neighborhood: true, category: true, heroImageUrl: true } as const;
    const rentSel = { id: true, slug: true, name: true, city: true, neighborhood: true, category: true, heroImageUrl: true, property: { select: { category: true } } } as const;
    if (o.kind === 'AGENT') {
      const [own, assigned, rentals] = await Promise.all([
        this.prisma.property.findMany({ where: { listedByAgentId: o.id }, select: propSel, take: 200 }),
        this.prisma.propertyAssignment.findMany({
          where: { isActive: true, kind: 'SALE', partnership: { agentId: o.id, status: 'ACTIVE' } },
          select: { property: { select: propSel } }, take: 200,
        }),
        this.prisma.rentListing.findMany({
          where: { status: { not: 'ARCHIVED' }, OR: [{ listedByAgentId: o.id }, { managingAgentId: o.id }] },
          select: rentSel, take: 200,
        }),
      ]);
      const sale = [...own, ...assigned.map((a) => a.property)].filter((p, i, arr) => arr.findIndex((x) => x.id === p.id) === i);
      return this.shapeLinkable(sale, rentals);
    }
    const [sale, rentals] = await Promise.all([
      this.prisma.property.findMany({ where: { developerId: o.id }, select: propSel, take: 200 }),
      this.prisma.rentListing.findMany({ where: { developerId: o.id, listedByAgentId: null, status: { not: 'ARCHIVED' } }, select: rentSel, take: 200 }),
    ]);
    return this.shapeLinkable(sale, rentals);
  }

  private shapeLinkable(
    sale: { id: string; slug: string; name: string; city: string | null; neighborhood: string | null; category: PropertyCategory | null; heroImageUrl: string | null }[],
    rentals: { id: string; slug: string; name: string; city: string | null; neighborhood: string | null; category: PropertyCategory | null; heroImageUrl: string | null; property: { category: PropertyCategory } | null }[],
  ) {
    return [
      ...sale.map((p) => ({ deal: 'SALE' as const, id: p.id, slug: p.slug, name: p.name, city: p.city, neighborhood: p.neighborhood, category: p.category, heroImageUrl: p.heroImageUrl })),
      ...rentals.map((r) => ({ deal: 'RENT' as const, id: r.id, slug: r.slug, name: r.name, city: r.city, neighborhood: r.neighborhood, category: r.category ?? r.property?.category ?? null, heroImageUrl: r.heroImageUrl })),
    ];
  }

  /** Check a link belongs to this owner, and read what the feed ranks by. */
  private async resolveLink(userId: string, propertyId?: string, rentListingId?: string) {
    if (propertyId && rentListingId) throw new BadRequestException('Link a property or a rental, not both');
    if (!propertyId && !rentListingId) return null;
    const items = await this.linkable(userId);
    const hit = items.find((i) => (propertyId ? i.deal === 'SALE' && i.id === propertyId : i.deal === 'RENT' && i.id === rentListingId));
    if (!hit) throw new ForbiddenException('You can only link your own listings');
    return hit;
  }

  async create(userId: string, dto: CreateReelDto) {
    const o = await this.ownerOf(userId);
    const st = await this.state(userId);
    if (!st.unlocked) throw new ForbiddenException('Unlock property reels to start posting');
    const link = await this.resolveLink(userId, dto.propertyId, dto.rentListingId);
    return this.prisma.reel.create({
      data: {
        ownerUserId: userId,
        ...(o.kind === 'AGENT' ? { agentId: o.id } : { developerId: o.id }),
        videoUrl: deliveryUrl(dto.videoUrl, dto.trimStartSec),
        thumbnailUrl: dto.thumbnailUrl ?? posterFor(dto.videoUrl, dto.trimStartSec),
        caption: dto.caption?.trim() || null,
        durationSec: dto.durationSec !== undefined ? Math.min(dto.durationSec, REEL_MAX_SECONDS) : undefined,
        // Files in Spaces cannot be trimmed on delivery, so the player enforces the window.
        trimStartSec: dto.trimStartSec ?? null,
        ...(link?.deal === 'SALE' && { propertyId: link.id }),
        ...(link?.deal === 'RENT' && { rentListingId: link.id }),
        city: link?.city ?? dto.city?.trim() ?? null,
        neighborhood: link?.neighborhood ?? dto.neighborhood?.trim() ?? null,
        category: link?.category ?? null,
        deal: link?.deal ?? null,
      },
    });
  }

  private async ownReel(userId: string, id: string) {
    const r = await this.prisma.reel.findUnique({ where: { id } });
    if (!r) throw new NotFoundException('Reel not found');
    if (r.ownerUserId !== userId) throw new ForbiddenException('Not your reel');
    return r;
  }

  async update(userId: string, id: string, dto: UpdateReelDto) {
    const r = await this.ownReel(userId, id);
    if (dto.status && r.status === 'REMOVED') throw new ForbiddenException('This reel was removed by e-resi and cannot be republished');
    const data: Prisma.ReelUpdateInput = {};
    if (dto.caption !== undefined) data.caption = dto.caption.trim() || null;
    if (dto.status) data.status = dto.status;
    if (dto.propertyId !== undefined || dto.rentListingId !== undefined) {
      const link = await this.resolveLink(userId, dto.propertyId || undefined, dto.rentListingId || undefined);
      data.property = link?.deal === 'SALE' ? { connect: { id: link.id } } : { disconnect: true };
      data.rentListing = link?.deal === 'RENT' ? { connect: { id: link.id } } : { disconnect: true };
      data.deal = link?.deal ?? null;
      if (link) { data.city = link.city; data.neighborhood = link.neighborhood; data.category = link.category; }
    }
    return this.prisma.reel.update({ where: { id }, data });
  }

  async remove(userId: string, id: string) {
    await this.ownReel(userId, id);
    await this.prisma.reel.delete({ where: { id } });
    return { ok: true };
  }

  async mine(userId: string) {
    const rows = await this.prisma.reel.findMany({
      where: { ownerUserId: userId }, orderBy: { createdAt: 'desc' }, take: 200, include: OWNER_SELECT,
    });
    return rows.map((r) => this.shape(r, false));
  }

  // ─── Public: the feed ─────────────────────────────────────────────────────

  /**
   * The ranked feed. A small, explainable recommender:
   *  - interest: places, kinds of home, sale-vs-rent and creators the viewer
   *    has liked or watched through (likes count three times a view),
   *  - freshness, decaying over about ten days,
   *  - engagement, log-scaled so one viral reel cannot drown the rest,
   *  - context: the page they came from (rent pages lean to rentals),
   *  - already-seen reels sink, and a daily per-viewer shuffle plus a
   *    no-same-creator-twice-in-a-row rule keep it from feeling repetitive.
   */
  async feed(q: FeedQueryDto, viewer: Viewer) {
    const limit = q.limit ?? 10;
    const offset = q.offset ?? 0;
    const where: Prisma.ReelWhereInput = {
      status: 'PUBLISHED',
      ...(q.agentId && { agentId: q.agentId }),
      ...(q.developerId && { developerId: q.developerId }),
    };
    const pool = await this.prisma.reel.findMany({ where, orderBy: { createdAt: 'desc' }, take: 400, include: OWNER_SELECT });
    if (pool.length === 0) return { items: [], nextOffset: null };

    const profile = await this.interestProfile(viewer);
    const key = viewer.userId ?? viewer.visitorId ?? 'anon';
    const day = new Date().toISOString().slice(0, 10);
    const now = Date.now();

    const scored = pool.map((r) => {
      const ageDays = (now - r.createdAt.getTime()) / 86_400_000;
      const fresh = 3 * Math.exp(-ageDays / 10);
      const engage = 0.8 * Math.log1p(r.likeCount * 2 + r.commentCount * 3 + r.viewCount * 0.2);
      const owner = r.agentId ?? r.developerId ?? '';
      const interest = 2.5 * profile.score('n', r.neighborhood) + 1.5 * profile.score('c', r.city)
        + profile.score('k', r.category) + profile.score('d', r.deal) + 1.5 * profile.score('o', owner);
      const context = q.deal && r.deal === q.deal ? 2 : 0;
      let score = fresh + engage + interest + context + 0.6 * jitter(`${r.id}:${key}:${day}`);
      if (profile.liked.has(r.id)) score *= 0.5;
      else if (profile.seen.has(r.id)) score *= 0.35;
      return { r, score, owner };
    }).sort((a, b) => b.score - a.score);

    // Same creator never twice in a row, when there is an alternative nearby.
    const ranked: typeof scored = [];
    const rest = [...scored];
    while (rest.length) {
      const prev = ranked[ranked.length - 1]?.owner;
      const i = rest.slice(0, 5).findIndex((x) => x.owner !== prev);
      ranked.push(rest.splice(i === -1 ? 0 : i, 1)[0]);
    }
    if (q.start) {
      const i = ranked.findIndex((x) => x.r.id === q.start);
      if (i > 0) ranked.unshift(ranked.splice(i, 1)[0]);
    }

    const page = ranked.slice(offset, offset + limit).map((x) => x.r);
    const likedIds = viewer.userId
      ? new Set((await this.prisma.reelLike.findMany({ where: { userId: viewer.userId, reelId: { in: page.map((r) => r.id) } }, select: { reelId: true } })).map((l) => l.reelId))
      : new Set<string>();
    return {
      items: page.map((r) => ({ ...this.shape(r, likedIds.has(r.id)) })),
      nextOffset: offset + limit < ranked.length ? offset + limit : null,
    };
  }

  /** Weighted counts of what this viewer liked (×3) and watched (×1, ×2 when watched through). */
  private async interestProfile(v: Viewer) {
    const counts = new Map<string, number>();
    const seen = new Set<string>();
    const liked = new Set<string>();
    const bump = (k: string, w: number) => counts.set(k, (counts.get(k) ?? 0) + w);
    const feed = (r: { city: string | null; neighborhood: string | null; category: string | null; deal: string | null; agentId: string | null; developerId: string | null }, w: number) => {
      if (r.neighborhood) bump(`n:${r.neighborhood.toLowerCase()}`, w);
      if (r.city) bump(`c:${r.city.toLowerCase()}`, w);
      if (r.category) bump(`k:${r.category}`, w);
      if (r.deal) bump(`d:${r.deal}`, w);
      const o = r.agentId ?? r.developerId;
      if (o) bump(`o:${o}`, w);
    };
    const sel = { city: true, neighborhood: true, category: true, deal: true, agentId: true, developerId: true } as const;
    const since = new Date(Date.now() - 60 * 86_400_000);
    const who: Prisma.ReelViewWhereInput | null = v.userId ? { userId: v.userId } : v.visitorId ? { visitorId: v.visitorId } : null;
    if (who) {
      const views = await this.prisma.reelView.findMany({
        where: { ...who, createdAt: { gte: since } }, orderBy: { createdAt: 'desc' }, take: 300,
        select: { reelId: true, watchedMs: true, reel: { select: { ...sel, durationSec: true } } },
      });
      for (const x of views) {
        seen.add(x.reelId);
        const through = x.reel.durationSec ? x.watchedMs >= x.reel.durationSec * 800 : x.watchedMs >= 8000;
        if (x.watchedMs >= 3000) feed(x.reel, through ? 2 : 1);
      }
    }
    if (v.userId) {
      const likes = await this.prisma.reelLike.findMany({
        where: { userId: v.userId }, orderBy: { createdAt: 'desc' }, take: 200, select: { reelId: true, reel: { select: sel } },
      });
      for (const l of likes) { liked.add(l.reelId); feed(l.reel, 3); }
    }
    const max: Record<string, number> = {};
    for (const [k, n] of counts) { const t = k[0]; max[t] = Math.max(max[t] ?? 0, n); }
    return {
      seen, liked,
      score: (t: 'n' | 'c' | 'k' | 'd' | 'o', val: string | null | undefined) => {
        if (!val || !max[t]) return 0;
        const k = `${t}:${t === 'n' || t === 'c' ? val.toLowerCase() : val}`;
        return (counts.get(k) ?? 0) / max[t];
      },
    };
  }

  private shape(r: ReelRow, likedByMe: boolean) {
    const link = r.property
      ? { deal: 'SALE' as const, slug: r.property.slug, name: r.property.name, priceFrom: r.property.priceFrom, currency: r.property.currency, href: `/${r.property.slug}` }
      : r.rentListing
        ? { deal: 'RENT' as const, slug: r.rentListing.slug, name: r.rentListing.name, priceFrom: r.rentListing.priceFrom, currency: r.rentListing.currency, href: `/rent/${r.rentListing.slug}` }
        : null;
    const owner = r.agent
      ? { kind: 'AGENT' as const, id: r.agent.id, name: r.agent.displayName, imageUrl: r.agent.photoUrl ?? r.agent.logoUrl, href: `/agents/${r.agent.id}` }
      : r.developer
        ? { kind: 'DEVELOPER' as const, id: r.developer.id, name: r.developer.companyName, imageUrl: r.developer.logoUrl, href: `/developers/${r.developer.id}` }
        : null;
    return {
      id: r.id, videoUrl: deliveryUrl(r.videoUrl), hlsUrl: hlsUrl(deliveryUrl(r.videoUrl)), thumbnailUrl: r.thumbnailUrl, caption: r.caption, durationSec: r.durationSec,
      trimStartSec: r.videoUrl.includes('res.cloudinary.com') ? null : r.trimStartSec,
      city: r.city, neighborhood: r.neighborhood, status: r.status, removedReason: r.removedReason,
      likeCount: r.likeCount, commentCount: r.commentCount, viewCount: r.viewCount,
      createdAt: r.createdAt, likedByMe, link, owner,
    };
  }

  async one(id: string, viewer: Viewer) {
    const r = await this.prisma.reel.findUnique({ where: { id }, include: OWNER_SELECT });
    if (!r || r.status !== 'PUBLISHED') throw new NotFoundException('Reel not found');
    const liked = viewer.userId ? !!(await this.prisma.reelLike.findUnique({ where: { reelId_userId: { reelId: id, userId: viewer.userId } } })) : false;
    return this.shape(r, liked);
  }

  // ─── Public: views, likes, comments ───────────────────────────────────────

  async view(id: string, viewer: Viewer, watchedMs = 0) {
    if (!viewer.userId && !viewer.visitorId) return { ok: true };
    const r = await this.prisma.reel.findUnique({ where: { id }, select: { id: true, status: true } });
    if (!r || r.status !== 'PUBLISHED') return { ok: true };
    await this.prisma.$transaction([
      this.prisma.reelView.create({ data: { reelId: id, userId: viewer.userId ?? null, visitorId: viewer.visitorId ?? null, watchedMs } }),
      this.prisma.reel.update({ where: { id }, data: { viewCount: { increment: 1 } } }),
    ]);
    return { ok: true };
  }

  async like(id: string, userId: string, on: boolean) {
    const r = await this.prisma.reel.findUnique({ where: { id }, select: { status: true } });
    if (!r || r.status !== 'PUBLISHED') throw new NotFoundException('Reel not found');
    const existing = await this.prisma.reelLike.findUnique({ where: { reelId_userId: { reelId: id, userId } } });
    if (on && !existing) {
      await this.prisma.$transaction([
        this.prisma.reelLike.create({ data: { reelId: id, userId } }),
        this.prisma.reel.update({ where: { id }, data: { likeCount: { increment: 1 } } }),
      ]);
    } else if (!on && existing) {
      await this.prisma.$transaction([
        this.prisma.reelLike.delete({ where: { reelId_userId: { reelId: id, userId } } }),
        this.prisma.reel.update({ where: { id }, data: { likeCount: { decrement: 1 } } }),
      ]);
    }
    const fresh = await this.prisma.reel.findUnique({ where: { id }, select: { likeCount: true } });
    return { liked: on, likeCount: fresh?.likeCount ?? 0 };
  }

  async comments(id: string, viewerUserId?: string | null) {
    const r = await this.prisma.reel.findUnique({
      where: { id },
      select: {
        ownerUserId: true,
        agent: { select: { displayName: true, photoUrl: true, logoUrl: true } },
        developer: { select: { companyName: true, logoUrl: true } },
      },
    });
    if (!r) throw new NotFoundException('Reel not found');
    // The owner replies as their business: their agent photo or logo, and
    // that name, when their own account has no picture.
    const ownerImage = r.agent?.photoUrl ?? r.agent?.logoUrl ?? r.developer?.logoUrl ?? null;
    const ownerName = r.agent?.displayName ?? r.developer?.companyName ?? null;
    const user = { select: { id: true, firstName: true, lastName: true, avatarUrl: true } } as const;
    const rows = await this.prisma.reelComment.findMany({
      where: { reelId: id, parentId: null, hiddenAt: null },
      orderBy: { createdAt: 'desc' }, take: 200,
      include: { user, replies: { where: { hiddenAt: null }, orderBy: { createdAt: 'asc' }, include: { user } } },
    });
    const shapeC = (c: { id: string; body: string; createdAt: Date; userId: string; user: { firstName: string; lastName: string; avatarUrl: string | null } }) => {
      const byOwner = c.userId === r.ownerUserId;
      const personal = [c.user.firstName, c.user.lastName?.[0] ? `${c.user.lastName[0]}.` : ''].filter(Boolean).join(' ');
      return {
      id: c.id, body: c.body, createdAt: c.createdAt,
      author: {
        name: byOwner && ownerName ? ownerName : personal,
        avatarUrl: byOwner ? (ownerImage ?? c.user.avatarUrl) : c.user.avatarUrl,
      },
      byOwner,
      mine: !!viewerUserId && c.userId === viewerUserId,
      };
    };
    return {
      canReply: !!viewerUserId && viewerUserId === r.ownerUserId,
      items: rows.map((c) => ({ ...shapeC(c), replies: c.replies.map(shapeC) })),
    };
  }

  async comment(id: string, userId: string, dto: CommentDto) {
    const body = dto.body.trim();
    if (!body) throw new BadRequestException('Write something first');
    const r = await this.prisma.reel.findUnique({ where: { id }, select: { id: true, status: true, ownerUserId: true, caption: true } });
    if (!r || r.status !== 'PUBLISHED') throw new NotFoundException('Reel not found');
    let parent: { id: string; userId: string } | null = null;
    if (dto.parentId) {
      if (userId !== r.ownerUserId) throw new ForbiddenException('Only the reel owner can reply to comments');
      parent = await this.prisma.reelComment.findFirst({ where: { id: dto.parentId, reelId: id, parentId: null }, select: { id: true, userId: true } });
      if (!parent) throw new NotFoundException('Comment not found');
    }
    const c = await this.prisma.$transaction(async (tx) => {
      const created = await tx.reelComment.create({ data: { reelId: id, userId, body, parentId: parent?.id ?? null } });
      await tx.reel.update({ where: { id }, data: { commentCount: { increment: 1 } } });
      return created;
    });
    const label = r.caption ? `“${r.caption.slice(0, 40)}${r.caption.length > 40 ? '…' : ''}”` : 'your reel';
    if (parent && parent.userId !== userId) {
      void this.notifications.createNotification(parent.userId, 'GENERAL', 'Reply to your comment', body.slice(0, 140), id, 'Reel', `/reels?start=${id}`).catch(() => undefined);
    } else if (!parent && r.ownerUserId !== userId) {
      const isAgent = !!(await this.prisma.agentProfile.findUnique({ where: { userId: r.ownerUserId }, select: { id: true } }));
      void this.notifications.createNotification(r.ownerUserId, 'GENERAL', `New comment on ${label}`, body.slice(0, 140), id, 'Reel', isAgent ? '/agent/reels' : '/dashboard/reels').catch(() => undefined);
    }
    return { id: c.id };
  }

  async deleteComment(commentId: string, userId: string, isAdmin: boolean) {
    const c = await this.prisma.reelComment.findUnique({ where: { id: commentId }, include: { reel: { select: { ownerUserId: true } }, _count: { select: { replies: true } } } });
    if (!c) throw new NotFoundException('Comment not found');
    if (!isAdmin && c.userId !== userId && c.reel.ownerUserId !== userId) throw new ForbiddenException('You cannot delete this comment');
    await this.prisma.$transaction([
      this.prisma.reelComment.delete({ where: { id: commentId } }),
      this.prisma.reel.update({ where: { id: c.reelId }, data: { commentCount: { decrement: 1 + c._count.replies } } }),
    ]);
    return { ok: true };
  }

  // ─── Admin ────────────────────────────────────────────────────────────────

  async adminList(status?: 'PUBLISHED' | 'HIDDEN' | 'REMOVED', q?: string, page = 1) {
    const take = 30;
    const where: Prisma.ReelWhereInput = {
      ...(status && { status }),
      ...(q && {
        OR: [
          { caption: { contains: q, mode: 'insensitive' } },
          { agent: { displayName: { contains: q, mode: 'insensitive' } } },
          { developer: { companyName: { contains: q, mode: 'insensitive' } } },
          { neighborhood: { contains: q, mode: 'insensitive' } },
        ],
      }),
    };
    const [rows, total, counts] = await Promise.all([
      this.prisma.reel.findMany({ where, orderBy: { createdAt: 'desc' }, skip: (page - 1) * take, take, include: OWNER_SELECT }),
      this.prisma.reel.count({ where }),
      this.prisma.reel.groupBy({ by: ['status'], _count: { _all: true } }),
    ]);
    return {
      items: rows.map((r) => this.shape(r, false)),
      total, page, totalPages: Math.max(1, Math.ceil(total / take)),
      counts: Object.fromEntries(counts.map((c) => [c.status, c._count._all])),
      price: await this.fee(), currency: await this.pricing.platformCurrency(),
    };
  }

  async adminSetStatus(id: string, status: 'PUBLISHED' | 'REMOVED', reason?: string) {
    const r = await this.prisma.reel.findUnique({ where: { id }, select: { ownerUserId: true, caption: true } });
    if (!r) throw new NotFoundException('Reel not found');
    const updated = await this.prisma.reel.update({ where: { id }, data: { status, removedReason: status === 'REMOVED' ? reason?.trim() || null : null } });
    if (status === 'REMOVED') {
      void this.notifications.createNotification(r.ownerUserId, 'GENERAL', 'A reel was taken down',
        reason?.trim() ? `Reason: ${reason.trim()}` : 'It did not meet e-resi content guidelines.', id, 'Reel').catch(() => undefined);
    }
    return updated;
  }
}

/** Reels play for at most this long; longer uploads are trimmed on delivery. */
export const REEL_MAX_SECONDS = 45;

/**
 * Served version of a reel: the 45-second window the owner chose (from
 * trimStart), never cropped — portrait stays portrait and landscape stays
 * landscape — capped at 1920px on the long side, Cloudinary's "good"
 * automatic quality and the best codec the browser supports, as MP4. Cuts a
 * phone video to well under half its size with no visible loss.
 * Already-transformed URLs pass through untouched.
 */
function deliveryUrl(url: string, trimStart = 0): string {
  if (!url.includes('res.cloudinary.com') || !url.includes('/video/upload/') || url.includes(`du_${REEL_MAX_SECONDS},`)) return url;
  const so = Math.max(0, Math.round(trimStart * 10) / 10);
  const t = `${so > 0 ? `so_${so},` : ''}du_${REEL_MAX_SECONDS},c_limit,w_1920,h_1920,q_auto:good,vc_auto`;
  return url.replace('/video/upload/', `/video/upload/${t}/`).replace(/\.[a-z0-9]+(\?.*)?$/i, '.mp4');
}

/**
 * Adaptive stream for a Cloudinary reel: the same 45-second window, as HLS
 * with Cloudinary's automatic ladder (several H.264 renditions; the player
 * switches between them as the connection changes). Null for files that are
 * not on Cloudinary, which play as plain MP4.
 */
function hlsUrl(storedUrl: string): string | null {
  const m = storedUrl.match(/^(https:\/\/res\.cloudinary\.com\/[^/]+\/video\/upload\/)([^/]*du_\d+[^/]*)\/(.+?)(?:\.[a-z0-9]+)?(\?.*)?$/i);
  if (!m) return null;
  const so = m[2].match(/(?:^|,)(so_[\d.]+)/)?.[1];
  return `${m[1]}${so ? `${so},` : ''}du_${REEL_MAX_SECONDS}/sp_auto/${m[3]}.m3u8`;
}

/** A poster frame from inside the chosen window, uncropped. */
function posterFor(videoUrl: string, trimStart = 0): string | null {
  if (!videoUrl.includes('res.cloudinary.com') || !videoUrl.includes('/video/upload/')) return null;
  const at = Math.round((trimStart + 1) * 10) / 10;
  return videoUrl.replace('/video/upload/', `/video/upload/so_${at},c_limit,w_720,h_720/`).replace(/\.[a-z0-9]+(\?.*)?$/i, '.jpg');
}

/** Stable 0..1 from a string: a per-viewer, per-day shuffle. */
function jitter(s: string): number {
  return parseInt(createHash('sha1').update(s).digest('hex').slice(0, 8), 16) / 0xffffffff;
}
