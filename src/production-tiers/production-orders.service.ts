import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import type { ProductionOrderStatus } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PricingService } from '../admin/pricing.service.js';

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
      select: { id: true, currency: true, submissionData: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    const submission = property.submissionData as {
      media?: { services?: Record<string, SelectedService> };
    } | null;
    const selected = submission?.media?.services ?? {};
    const keys = Object.keys(selected);

    const catalog = await this.pricing.listServices().catch(() => []);
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
        currency: prior?.currency ?? item?.currency ?? property.currency ?? 'KES',
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
            developer: { select: { id: true, companyName: true } },
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

    return { before, after };
  }
}
