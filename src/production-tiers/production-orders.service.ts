import {
  BadRequestException, ForbiddenException, forwardRef, Inject, Injectable, Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole, type ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { InvoicesService } from '../billing/invoices.service.js';

/** Shape of one selected service inside a property's submissionData. */
interface SelectedService {
  preferredDate?: string;
  instructions?: string;
  accessInfo?: string;
}

/** "drone_photo" → "Drone photo" — fallback when the catalog has no entry. */
const humanise = (key: string) =>
  key.replace(/[_-]/g, ' ').replace(/^./, (c) => c.toUpperCase());

@Injectable()
export class ProductionOrdersService {
  private readonly logger = new Logger(ProductionOrdersService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly pricing: PricingService,
    private readonly events: PlatformEventsService,
    @Inject(forwardRef(() => InvoicesService))
    private readonly invoices: InvoicesService,
  ) {}

  /**
   * Turn the services a developer picked during submission into real order
   * rows — one per service, because photography and a cinematic tour are two
   * separate jobs, scheduled on different days and billed as separate lines.
   *
   * Idempotent on (propertyId, serviceKey): re-saving a submission updates the
   * brief rather than duplicating the job. Services removed from the selection
   * are cancelled rather than deleted, so an order that ops already scheduled
   * leaves a trace.
   */
  async syncFromSubmission(propertyId: string): Promise<{ created: number; updated: number; cancelled: number }> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { id: true, currency: true, submissionData: true, category: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    const submission = property.submissionData as {
      media?: { services?: Record<string, SelectedService> };
    } | null;
    const selected = submission?.media?.services ?? {};
    const keys = Object.keys(selected);

    const platformCurrency = await this.pricing.platformCurrency();
    // Priced for this development's type — shooting a villa is not priced like
    // a one-bed apartment. Falls back to the catalog default per service.
    const catalog = await this.pricing
      .listServicesForType(property.category)
      .catch(() => [] as { key: string; label: string; price: number; currency: string }[]);
    const byKey = new Map(catalog.map((c: { key: string; label: string; price: number; currency: string }) => [c.key, c]));

    const existing = await this.prisma.productionOrder.findMany({ where: { propertyId } });
    const existingByKey = new Map(existing.map((o) => [o.serviceKey, o]));

    let created = 0;
    let updated = 0;

    for (const key of keys) {
      const brief = selected[key] ?? {};
      const item = byKey.get(key);
      const prior = existingByKey.get(key);

      const data = {
        label: item?.label ?? prior?.label ?? humanise(key),
        // Price is captured at order time. A later catalog change must not
        // silently re-price work that was already commissioned.
        amount: prior?.amount ?? item?.price ?? 0,
        // The platform bills in its own currency; a listing priced in USD is
        // still invoiced in KES.
        currency: prior?.currency ?? item?.currency ?? platformCurrency,
        preferredDate: brief.preferredDate || null,
        instructions: brief.instructions || null,
        accessInfo: brief.accessInfo || null,
      };

      if (prior) {
        // Only the brief is refreshed. Status, schedule and crew notes belong
        // to ops and must survive the developer editing their submission.
        await this.prisma.productionOrder.update({
          where: { id: prior.id },
          data: {
            preferredDate: data.preferredDate,
            instructions: data.instructions,
            accessInfo: data.accessInfo,
            ...(prior.status === 'CANCELLED' && { status: 'ORDERED' as const }),
          },
        });
        updated++;
      } else {
        await this.prisma.productionOrder.create({
          data: { propertyId, serviceKey: key, ...data },
        });
        created++;
      }
    }

    // Deselected services: cancel rather than delete, and never touch work
    // that has already been delivered.
    const removed = existing.filter(
      (o) => !keys.includes(o.serviceKey) && o.status !== 'CANCELLED' && o.status !== 'DELIVERED',
    );
    for (const order of removed) {
      await this.prisma.productionOrder.update({
        where: { id: order.id },
        data: { status: 'CANCELLED' },
      });
    }

    return { created, updated, cancelled: removed.length };
  }

  /**
   * One-off backfill for selections made before orders existed. Creates the
   * order rows only — invoicing them is a separate decision, since developers
   * should not receive a surprise bill for something they picked months ago.
   */
  async backfill(): Promise<{ properties: number; created: number }> {
    // Prisma types JSON null filters separately from column nulls; select every
    // property and let syncFromSubmission skip the ones with no services.
    const candidates = await this.prisma.property.findMany({ select: { id: true } });

    let created = 0;
    let touched = 0;
    for (const { id } of candidates) {
      try {
        const r = await this.syncFromSubmission(id);
        if (r.created > 0) {
          created += r.created;
          touched++;
        }
      } catch (err) {
        this.logger.error(`Backfill failed for property ${id}: ${(err as Error).message}`);
      }
    }

    this.logger.log(`Backfill: ${created} orders across ${touched} properties`);
    return { properties: touched, created };
  }

  /**
   * Order additional services for a development that already exists.
   *
   * Production is not a one-shot decision made during submission: a developer
   * who launches with photography often wants a cinematic tour once units start
   * moving. Prices are taken from the catalog at the moment of ordering, not
   * from whatever they were when the property was created.
   *
   * The submission JSON is updated alongside the order rows so the two do not
   * drift — syncFromSubmission would otherwise cancel anything absent from it.
   */
  async orderServices(
    slug: string,
    userId: string,
    userRole: UserRole,
    items: { serviceKey: string; preferredDate?: string; instructions?: string; accessInfo?: string }[],
  ) {
    if (!items.length) throw new BadRequestException('Choose at least one service');

    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: { select: { userId: true, companyName: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    // Priced for this development's type, same as the submission path.
    const catalog = await this.pricing.listServicesForType(property.category);
    const byKey = new Map(
      catalog.map((c: { key: string; label: string; price: number; currency: string }) => [c.key, c]),
    );

    const unknown = items.filter((i) => !byKey.has(i.serviceKey));
    if (unknown.length) {
      throw new BadRequestException(
        `Not in the catalog: ${unknown.map((u) => u.serviceKey).join(', ')}`,
      );
    }

    // Re-ordering a service already in production would double-bill it. Only a
    // cancelled one may be raised again.
    const existing = await this.prisma.productionOrder.findMany({
      where: { propertyId: property.id, serviceKey: { in: items.map((i) => i.serviceKey) } },
    });
    const blocked = existing.filter((o) => o.status !== 'CANCELLED');
    if (blocked.length) {
      throw new BadRequestException(
        `Already ordered: ${blocked.map((b) => b.label).join(', ')}`,
      );
    }

    const created = [];
    for (const item of items) {
      const cat = byKey.get(item.serviceKey)!;
      const prior = existing.find((o) => o.serviceKey === item.serviceKey);

      const data = {
        label: cat.label,
        amount: cat.price,
        currency: cat.currency,
        status: 'ORDERED' as const,
        preferredDate: item.preferredDate || null,
        instructions: item.instructions || null,
        accessInfo: item.accessInfo || null,
        // A re-order is new work: clear the schedule and invoice of the
        // cancelled attempt so it cannot be mistaken for already billed.
        scheduledAt: null,
        deliveredAt: null,
        invoiceId: null,
      };

      created.push(prior
        ? await this.prisma.productionOrder.update({ where: { id: prior.id }, data })
        : await this.prisma.productionOrder.create({
          data: { propertyId: property.id, serviceKey: item.serviceKey, ...data },
        }));
    }

    await this.mergeIntoSubmission(property.id, items);

    await this.events.productionOrdered(
      property.name,
      property.developer.companyName,
      created.map((o) => ({ label: o.label, amount: o.amount, currency: o.currency })),
    );

    return created;
  }

  /**
   * Fold newly ordered services back into submissionData. Without this the next
   * syncFromSubmission would see them missing and cancel them.
   */
  private async mergeIntoSubmission(
    propertyId: string,
    items: { serviceKey: string; preferredDate?: string; instructions?: string; accessInfo?: string }[],
  ): Promise<void> {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { submissionData: true },
    });
    const submission = (property?.submissionData ?? {}) as Record<string, unknown>;
    const media = (submission.media ?? {}) as Record<string, unknown>;
    const services = (media.services ?? {}) as Record<string, unknown>;

    for (const item of items) {
      services[item.serviceKey] = {
        preferredDate: item.preferredDate ?? '',
        instructions: item.instructions ?? '',
        accessInfo: item.accessInfo ?? '',
      };
    }

    await this.prisma.property.update({
      where: { id: propertyId },
      data: {
        submissionData: { ...submission, media: { ...media, services } } as object,
      },
    });
  }

  /** A developer's orders for one of their developments. */
  async forProperty(slug: string, userId: string, userRole: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: { select: { userId: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }
    return this.prisma.productionOrder.findMany({
      where: { propertyId: property.id },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Queries & ops ───────────────────────────────────────────────────────

  async list(filters: { status?: ProductionOrderStatus; propertyId?: string } = {}) {
    return this.prisma.productionOrder.findMany({
      where: {
        ...(filters.status && { status: filters.status }),
        ...(filters.propertyId && { propertyId: filters.propertyId }),
      },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      include: {
        property: {
          select: {
            slug: true,
            name: true,
            city: true,
            heroImageUrl: true,
            developer: {
              select: {
                id: true,
                companyName: true,
                // Ops ring the developer to agree a new date before moving a
                // booking. phone is the public business line; the account
                // owner's own number and email are the fallback when it is
                // not set.
                phone: true,
                whatsapp: true,
                user: { select: { firstName: true, lastName: true, phone: true, email: true } },
              },
            },
          },
        },
      },
      take: 300,
    });
  }

  async update(
    id: string,
    data: { status?: ProductionOrderStatus; scheduledAt?: string; crewNotes?: string; amount?: number },
  ) {
    const before = await this.prisma.productionOrder.findUnique({
      where: { id },
      include: { property: { select: { name: true, developer: { select: { userId: true } } } } },
    });
    if (!before) throw new NotFoundException('Production order not found');

    const after = await this.prisma.productionOrder.update({
      where: { id },
      data: {
        ...(data.status && { status: data.status }),
        ...(data.scheduledAt !== undefined && {
          scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
        }),
        ...(data.crewNotes !== undefined && { crewNotes: data.crewNotes }),
        ...(data.amount !== undefined && { amount: data.amount }),
        ...(data.status === 'DELIVERED' && { deliveredAt: new Date() }),
      },
      include: { property: { select: { name: true, slug: true } } },
    });

    // The developer needs to arrange site access, so a booked date is only
    // useful to them if we say so. Only announce genuine transitions.
    const owner = before.property.developer.userId;

    // Booking a crew is the point the work is committed, so that is when it
    // gets billed. Guarded on invoiceId so re-scheduling never bills twice,
    // and on amount so a free service is not invoiced for zero.
    if (after.status === 'SCHEDULED' && !after.invoiceId && after.amount > 0) {
      try {
        const invoice = await this.invoices.invoiceProduction({
          userId: owner,
          propertyId: after.propertyId,
          propertyName: after.property.name,
          currency: after.currency,
          lines: [{
            description: `${after.label} · ${after.property.name}`,
            amount: after.amount,
          }],
        });
        await this.prisma.productionOrder.update({
          where: { id: after.id },
          data: { invoiceId: invoice.id },
        });
      } catch (err) {
        // The booking stands; an uninvoiced job is an ops problem, not a
        // reason to refuse the crew date.
        this.logger.error(
          `Could not invoice production order ${after.id}: ${(err as Error).message}`,
        );
      }
    }

    const dateMoved =
      after.scheduledAt && before.scheduledAt
      && after.scheduledAt.getTime() !== before.scheduledAt.getTime();

    if (after.status === 'SCHEDULED' && after.scheduledAt && before.status !== 'SCHEDULED') {
      await this.events.productionScheduled(
        owner,
        { id: after.id, label: after.label, scheduledAt: after.scheduledAt },
        after.property.name,
      );
    } else if (after.status === 'SCHEDULED' && after.scheduledAt && dateMoved) {
      // Already scheduled and the date changed. Without this branch a
      // reschedule was silent — the developer kept planning around the old
      // date because nothing ever told them it had moved.
      await this.events.productionRescheduled(
        owner,
        {
          id: after.id,
          label: after.label,
          scheduledAt: after.scheduledAt,
          previousDate: before.scheduledAt,
        },
        after.property.name,
      );
    } else if (after.status === 'DELIVERED' && before.status !== 'DELIVERED') {
      await this.events.productionDelivered(
        owner, { id: after.id, label: after.label }, after.property.name,
      );
    }

    return { before, after };
  }
}
