import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { slugify } from '../rent-listings/slug.util.js';

/** Statuses a visitor can actually browse — what "listed" means in a count. */
const PUBLIC_STATUSES = ['ACTIVE', 'OFF_PLAN'] as const;

export interface UpsertNeighborhoodDto {
  name: string;
  city: string;
  description?: string;
  lifestyle?: string;
  schools?: string;
  transport?: string;
  heroImageUrl?: string;
  photos?: string[];
  latitude?: number;
  longitude?: number;
}

@Injectable()
export class NeighborhoodsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Live property counts per neighbourhood name, case-insensitive.
   *
   * Properties carry the neighbourhood as free text, so the guide and the
   * listings meet on the lowercased name — a guide for "Kileleshwa" counts
   * properties typed as "kileleshwa" too.
   */
  private async countsByName(): Promise<Map<string, number>> {
    const grouped = await this.prisma.property.groupBy({
      by: ['neighborhood'],
      where: { status: { in: [...PUBLIC_STATUSES] } },
      _count: { _all: true },
    });
    const map = new Map<string, number>();
    for (const g of grouped) {
      if (!g.neighborhood) continue;
      const key = g.neighborhood.trim().toLowerCase();
      map.set(key, (map.get(key) ?? 0) + g._count._all);
    }
    return map;
  }

  async listPublic(city?: string) {
    const [rows, counts] = await Promise.all([
      this.prisma.neighborhood.findMany({
        where: city ? { city: { equals: city, mode: 'insensitive' } } : {},
        orderBy: { name: 'asc' },
      }),
      this.countsByName(),
    ]);
    return rows.map((n) => ({
      ...n,
      propertyCount: counts.get(n.name.trim().toLowerCase()) ?? 0,
    }));
  }

  async getPublic(slug: string) {
    const n = await this.prisma.neighborhood.findUnique({ where: { slug } });
    if (!n) throw new NotFoundException('Neighbourhood not found');

    // The market overview is computed from what is actually listed right
    // now, not curated — median and range of asking prices in the area.
    const listed = await this.prisma.property.findMany({
      where: {
        status: { in: [...PUBLIC_STATUSES] },
        neighborhood: { equals: n.name.trim(), mode: 'insensitive' },
      },
      select: { priceFrom: true, category: true },
    });
    const prices = listed
      .map((p) => p.priceFrom)
      .filter((v): v is number => v != null && v > 0)
      .sort((a, b) => a - b);
    const median = prices.length
      ? prices.length % 2
        ? prices[(prices.length - 1) / 2]
        : (prices[prices.length / 2 - 1] + prices[prices.length / 2]) / 2
      : null;
    const byCategory: Record<string, number> = {};
    for (const p of listed) byCategory[p.category] = (byCategory[p.category] ?? 0) + 1;

    return {
      ...n,
      propertyCount: listed.length,
      market: {
        total: listed.length,
        priceMin: prices[0] ?? null,
        priceMax: prices[prices.length - 1] ?? null,
        priceMedian: median,
        byCategory,
      },
    };
  }

  // ─── Admin CRUD ───────────────────────────────────────────────────────────

  async create(dto: UpsertNeighborhoodDto) {
    const base = slugify(`${dto.name} ${dto.city}`);
    let slug = base;
    let counter = 1;
    while (await this.prisma.neighborhood.findUnique({ where: { slug } })) {
      slug = `${base}-${counter++}`;
    }
    return this.prisma.neighborhood.create({
      data: {
        slug,
        name: dto.name.trim(),
        city: dto.city.trim(),
        description: dto.description,
        lifestyle: dto.lifestyle,
        schools: dto.schools,
        transport: dto.transport,
        heroImageUrl: dto.heroImageUrl,
        photos: dto.photos ?? [],
        latitude: dto.latitude,
        longitude: dto.longitude,
      },
    });
  }

  async update(id: string, dto: Partial<UpsertNeighborhoodDto>) {
    const existing = await this.prisma.neighborhood.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Neighbourhood not found');
    return this.prisma.neighborhood.update({
      where: { id },
      data: {
        ...(dto.name !== undefined && { name: dto.name.trim() }),
        ...(dto.city !== undefined && { city: dto.city.trim() }),
        ...(dto.description !== undefined && { description: dto.description }),
        ...(dto.lifestyle !== undefined && { lifestyle: dto.lifestyle }),
        ...(dto.schools !== undefined && { schools: dto.schools }),
        ...(dto.transport !== undefined && { transport: dto.transport }),
        ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
        ...(dto.photos !== undefined && { photos: dto.photos }),
        ...(dto.latitude !== undefined && { latitude: dto.latitude }),
        ...(dto.longitude !== undefined && { longitude: dto.longitude }),
      },
    });
  }

  async remove(id: string) {
    const existing = await this.prisma.neighborhood.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Neighbourhood not found');
    await this.prisma.neighborhood.delete({ where: { id } });
    return { message: 'Neighbourhood removed' };
  }
}
