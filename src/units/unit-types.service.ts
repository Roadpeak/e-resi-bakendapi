import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PropertyStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { canManageProperty } from '../properties/property-owner.js';
import { publicType, typeCounts } from './unit-type-counts.js';
import type { MoveInventoryDto, UnitTypeDto, UnitTypeMediaDto, UpdateUnitTypeDto } from './dto/unit-type.dto.js';

const SCALARS = [
  'name', 'description', 'bedrooms', 'bathrooms', 'sqm', 'sqft', 'priceFrom', 'priceTo',
  'features', 'floorPlanUrl', 'coverImageUrl', 'availableCount', 'reservedCount', 'soldCount',
  'cinematicSceneIds', 'tourSection3DIds', 'vrSceneIds', 'order',
] as const;

/**
 * Unit types — the layouts a development sells many identical copies of.
 *
 * A type is described once (photos, video, which tours show) and carries its
 * inventory as counts, so a 300-unit tower is a handful of types rather than
 * 300 rows. Individual units can still be linked to a type when the developer
 * sells specific floors; the counts then follow those units.
 */
@Injectable()
export class UnitTypesService {
  constructor(private readonly prisma: PrismaService) {}

  private async owned(slug: string, userId: string, role: UserRole) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      include: { developer: { select: { userId: true } }, listedByAgent: { select: { userId: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (!canManageProperty(property, userId, role)) throw new ForbiddenException('You do not own this property');
    return property;
  }

  private async ownedType(slug: string, id: string, userId: string, role: UserRole) {
    const property = await this.owned(slug, userId, role);
    const type = await this.prisma.unitType.findFirst({ where: { id, propertyId: property.id } });
    if (!type) throw new NotFoundException('Unit type not found');
    return { property, type };
  }

  private data(dto: UnitTypeDto | UpdateUnitTypeDto) {
    const out: Record<string, unknown> = {};
    for (const k of SCALARS) {
      const v = (dto as Record<string, unknown>)[k];
      if (v !== undefined) out[k] = typeof v === 'string' && k !== 'name' ? (v.trim() || null) : v;
    }
    if (typeof out.name === 'string') out.name = (out.name as string).trim();
    if (
      typeof out.priceFrom === 'number' && typeof out.priceTo === 'number'
      && (out.priceTo as number) < (out.priceFrom as number)
    ) {
      throw new BadRequestException('The top of the price range is below its start');
    }
    return out;
  }

  /** Link exactly these units (from this development) to the type. */
  private async linkUnits(propertyId: string, typeId: string, unitIds: string[]) {
    const ids = [...new Set(unitIds)];
    if (ids.length) {
      const found = await this.prisma.unit.count({ where: { id: { in: ids }, propertyId } });
      if (found !== ids.length) throw new BadRequestException('Some of those units are not in this development');
    }
    await this.prisma.$transaction([
      this.prisma.unit.updateMany({ where: { unitTypeId: typeId, id: { notIn: ids } }, data: { unitTypeId: null } }),
      ...(ids.length
        ? [this.prisma.unit.updateMany({ where: { id: { in: ids }, propertyId }, data: { unitTypeId: typeId } })]
        : []),
    ]);
  }

  // ─── Owner ───────────────────────────────────────────────────────────────

  async listForOwner(slug: string, userId: string, role: UserRole) {
    const property = await this.owned(slug, userId, role);
    const types = await this.prisma.unitType.findMany({
      where: { propertyId: property.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        units: { select: { id: true, name: true, status: true, floor: true } },
        media: { orderBy: { order: 'asc' } },
      },
    });
    return types.map((t) => ({ ...t, counts: typeCounts(t) }));
  }

  async create(slug: string, userId: string, role: UserRole, dto: UnitTypeDto) {
    const property = await this.owned(slug, userId, role);
    const last = await this.prisma.unitType.findFirst({
      where: { propertyId: property.id }, orderBy: { order: 'desc' }, select: { order: true },
    });
    const type = await this.prisma.unitType.create({
      data: {
        ...(this.data(dto) as { name: string }),
        propertyId: property.id,
        order: dto.order ?? (last ? last.order + 1 : 0),
      },
    });
    if (dto.unitIds) await this.linkUnits(property.id, type.id, dto.unitIds);
    return type;
  }

  async update(slug: string, id: string, userId: string, role: UserRole, dto: UpdateUnitTypeDto) {
    const { property } = await this.ownedType(slug, id, userId, role);
    const type = await this.prisma.unitType.update({ where: { id }, data: this.data(dto) });
    if (dto.unitIds) await this.linkUnits(property.id, id, dto.unitIds);
    return type;
  }

  /**
   * Move units between available, reserved and sold — the one-tap update a
   * sales team makes all day ("one more 3-bed sold"). Only for hand-kept
   * counts: linked units change status on the units themselves.
   */
  async move(slug: string, id: string, userId: string, role: UserRole, dto: MoveInventoryDto) {
    const { type } = await this.ownedType(slug, id, userId, role);
    if (dto.from === dto.to) throw new BadRequestException('Pick two different states');
    const linked = await this.prisma.unit.count({ where: { unitTypeId: id } });
    if (linked > 0) {
      throw new BadRequestException('This type counts its linked units — change the units themselves');
    }
    const n = dto.count ?? 1;
    const field = { available: 'availableCount', reserved: 'reservedCount', sold: 'soldCount' } as const;
    if (type[field[dto.from]] < n) throw new BadRequestException(`Only ${type[field[dto.from]]} ${dto.from}`);
    const updated = await this.prisma.unitType.update({
      where: { id },
      data: { [field[dto.from]]: { decrement: n }, [field[dto.to]]: { increment: n } },
    });
    return { ...updated, counts: typeCounts(updated) };
  }

  async remove(slug: string, id: string, userId: string, role: UserRole) {
    await this.ownedType(slug, id, userId, role);
    // Linked units survive — they just stop belonging to a type.
    await this.prisma.unitType.delete({ where: { id } });
    return { message: 'Unit type removed' };
  }

  async addMedia(slug: string, id: string, userId: string, role: UserRole, dto: UnitTypeMediaDto) {
    await this.ownedType(slug, id, userId, role);
    const last = await this.prisma.mediaAsset.findFirst({
      where: { unitTypeId: id }, orderBy: { order: 'desc' }, select: { order: true },
    });
    return this.prisma.mediaAsset.create({
      data: {
        unitTypeId: id,
        type: dto.type,
        url: dto.url,
        title: dto.title,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
        order: last ? last.order + 1 : 0,
      },
    });
  }

  async removeMedia(slug: string, id: string, mediaId: string, userId: string, role: UserRole) {
    await this.ownedType(slug, id, userId, role);
    const media = await this.prisma.mediaAsset.findFirst({ where: { id: mediaId, unitTypeId: id } });
    if (!media) throw new NotFoundException('Media not found');
    await this.prisma.mediaAsset.delete({ where: { id: mediaId } });
    return { message: 'Removed' };
  }

  // ─── Public ──────────────────────────────────────────────────────────────

  private async publicProperty(slug: string) {
    const property = await this.prisma.property.findUnique({ where: { slug }, select: { id: true, status: true } });
    if (!property || property.status === PropertyStatus.ARCHIVED) throw new NotFoundException('Property not found');
    return property;
  }

  async list(slug: string) {
    const property = await this.publicProperty(slug);
    const types = await this.prisma.unitType.findMany({
      where: { propertyId: property.id },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
      include: {
        units: { select: { status: true } },
        media: { orderBy: { order: 'asc' }, take: 6, select: { id: true, url: true, type: true, title: true, thumbnailUrl: true } },
      },
    });
    return types.map(({ units, ...t }) => publicType({ ...t, units }));
  }

  /**
   * Everything a type page needs: the type, its own photos and video, the
   * tours the developer chose for it, the individual units (when linked), and
   * the development around it.
   */
  async findOne(slug: string, id: string) {
    const property = await this.publicProperty(slug);
    const type = await this.prisma.unitType.findFirst({
      where: { id, propertyId: property.id },
      include: {
        media: { orderBy: { order: 'asc' } },
        units: {
          orderBy: [{ floor: 'asc' }, { name: 'asc' }],
          select: { id: true, name: true, floor: true, price: true, status: true, sqm: true },
        },
      },
    });
    if (!type) throw new NotFoundException('Unit type not found');

    const [p, siblings] = await Promise.all([
      this.prisma.property.findUnique({
        where: { id: property.id },
        select: {
          id: true, slug: true, name: true, tagline: true, city: true, neighborhood: true, county: true,
          heroImageUrl: true, currency: true, completionDate: true, category: true,
          hasCinematicTour: true, has3DTour: true, hasVRTour: true, unitFeatures: true, features: true,
          brandColor: true,
          developer: { select: { id: true, companyName: true, logoUrl: true } },
          listedByAgent: { select: { id: true, displayName: true, logoUrl: true, photoUrl: true } },
          developerName: true,
          media: { orderBy: { order: 'asc' }, select: { id: true, url: true, title: true, type: true } },
          cinematicScenes: {
            where: { id: { in: type.cinematicSceneIds } },
            orderBy: { order: 'asc' },
          },
          tourSections3D: {
            where: { id: { in: type.tourSection3DIds } },
            orderBy: { order: 'asc' },
            include: { scenes: { orderBy: { order: 'asc' } } },
          },
          tourScenesVR: {
            where: { id: { in: type.vrSceneIds } },
            orderBy: { order: 'asc' },
          },
        },
      }),
      this.prisma.unitType.findMany({
        where: { propertyId: property.id, id: { not: id } },
        orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
        include: { units: { select: { status: true } } },
      }),
    ]);

    return {
      ...publicType(type),
      property: p,
      otherTypes: siblings.map(({ units, ...t }) => {
        const { units: _u, ...rest } = publicType({ ...t, units });
        void _u;
        return {
          id: rest.id, name: rest.name, bedrooms: rest.bedrooms, sqm: rest.sqm, sqft: rest.sqft,
          priceFrom: rest.priceFrom, priceTo: rest.priceTo, coverImageUrl: rest.coverImageUrl, counts: rest.counts,
        };
      }),
    };
  }
}
