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
    const counts = await this.countsByName();
    return { ...n, propertyCount: counts.get(n.name.trim().toLowerCase()) ?? 0 };
  }

  // ─── Auto-detected amenities ──────────────────────────────────────────────

  /**
   * What actually surrounds the pin, from OpenStreetMap via Overpass —
   * schools, clinics, supermarkets, cafés — grouped into friendly buckets.
   * Nothing is curated: drop a pin, the amenities section fills itself.
   * Cached per area because Overpass is a shared public service.
   */
  private amenitiesCache = new Map<string, { at: number; data: unknown }>();
  private static readonly AMENITIES_TTL_MS = 6 * 60 * 60 * 1000;

  async getAmenities(slug: string) {
    const n = await this.prisma.neighborhood.findUnique({ where: { slug } });
    if (!n) throw new NotFoundException('Neighbourhood not found');
    if (n.latitude == null || n.longitude == null) {
      return { total: 0, categories: [] };
    }

    const cached = this.amenitiesCache.get(slug);
    if (cached && Date.now() - cached.at < NeighborhoodsService.AMENITIES_TTL_MS) {
      return cached.data;
    }

    const around = `around:2500,${n.latitude},${n.longitude}`;
    const query = `[out:json][timeout:12];(
      node(${around})[amenity~"^(school|college|university|hospital|clinic|doctors|pharmacy|restaurant|cafe|fast_food|bank|atm|fuel|police|place_of_worship)$"];
      way(${around})[amenity~"^(school|college|university|hospital|clinic)$"];
      node(${around})[shop~"^(supermarket|mall|convenience)$"];
      way(${around})[shop~"^(supermarket|mall)$"];
      node(${around})[leisure~"^(park|fitness_centre|sports_centre|playground)$"];
      way(${around})[leisure~"^(park|golf_course)$"];
    );out tags 300;`;

    const BUCKETS: { key: string; label: string; match: (t: Record<string, string>) => boolean }[] = [
      { key: 'schools', label: 'Schools & universities', match: (t) => ['school', 'college', 'university'].includes(t.amenity) },
      { key: 'health', label: 'Healthcare', match: (t) => ['hospital', 'clinic', 'doctors', 'pharmacy'].includes(t.amenity) },
      { key: 'dining', label: 'Dining & cafés', match: (t) => ['restaurant', 'cafe', 'fast_food'].includes(t.amenity) },
      { key: 'shopping', label: 'Shopping', match: (t) => ['supermarket', 'mall', 'convenience'].includes(t.shop) },
      { key: 'banks', label: 'Banks & ATMs', match: (t) => ['bank', 'atm'].includes(t.amenity) },
      { key: 'parks', label: 'Parks & fitness', match: (t) => ['park', 'fitness_centre', 'sports_centre', 'playground', 'golf_course'].includes(t.leisure) },
      { key: 'fuel', label: 'Fuel stations', match: (t) => t.amenity === 'fuel' },
      { key: 'police', label: 'Police', match: (t) => t.amenity === 'police' },
      { key: 'worship', label: 'Places of worship', match: (t) => t.amenity === 'place_of_worship' },
    ];

    try {
      const res = await fetch('https://overpass-api.de/api/interpreter', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          // OSM usage policy: identify the application or be 406'd.
          'User-Agent': 'e-resi.com area-guides (hello@e-resi.com)',
        },
        body: `data=${encodeURIComponent(query)}`,
        signal: AbortSignal.timeout(15_000),
      });
      if (!res.ok) throw new Error(`overpass ${res.status}`);
      const json = (await res.json()) as { elements?: { tags?: Record<string, string> }[] };

      const grouped = BUCKETS.map((b) => ({ key: b.key, label: b.label, count: 0, names: [] as string[] }));
      for (const el of json.elements ?? []) {
        const tags = el.tags ?? {};
        const bucketIndex = BUCKETS.findIndex((b) => b.match(tags));
        if (bucketIndex === -1) continue;
        const g = grouped[bucketIndex];
        g.count += 1;
        const name = tags.name?.trim();
        if (name && !g.names.includes(name) && g.names.length < 6) g.names.push(name);
      }

      const categories = grouped.filter((g) => g.count > 0);
      const data = { total: categories.reduce((sum, g) => sum + g.count, 0), categories };
      this.amenitiesCache.set(slug, { at: Date.now(), data });
      return data;
    } catch {
      // Overpass down or slow — the section simply shows nothing rather
      // than failing the page. Not cached, so the next visit retries.
      return { total: 0, categories: [], unavailable: true };
    }
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
