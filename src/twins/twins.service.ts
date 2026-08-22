import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../media/storage.service.js';
import { summariseGlb, GlbError, type GlbSummary } from './glb.js';
import type { UpsertTwinDto, CreateWaypointDto, CreateTagDto } from './dto/twin.dto.js';

/**
 * Digital twins — the building geometry behind a 3D tour.
 *
 * Everything here is admin-only by design. We produce these models ourselves,
 * so a developer uploading their own would bypass the capture and cleanup that
 * makes one usable.
 */

/** Above this a phone on mobile data struggles. Warned, not blocked. */
const TRIANGLE_BUDGET = 400_000;
const SIZE_BUDGET_BYTES = 25 * 1024 * 1024;

@Injectable()
export class TwinsService {
  private readonly logger = new Logger(TwinsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  /**
   * Every model for a property, the one to open first at the front.
   *
   * A list rather than a single record: a development is captured in pieces —
   * the building, a show unit, the amenity deck — and the viewer offers them
   * as a switcher.
   */
  async list(slug: string) {
    const property = await this.prisma.property.findUnique({
      where: { slug },
      select: { id: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    return this.prisma.digitalTwin.findMany({
      where: { propertyId: property.id },
      orderBy: [{ isPrimary: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
      include: {
        waypoints: { orderBy: { order: 'asc' } },
        tags: true,
      },
    });
  }

  /**
   * Upload a .glb and attach it to a property.
   *
   * The file is parsed before it is stored: a mislabelled or corrupt model
   * would otherwise only reveal itself as an empty viewer on a buyer's phone,
   * long after whoever produced it could act on the problem.
   */
  async uploadMesh(
    slug: string,
    role: UserRole,
    file: { originalname: string; buffer: Buffer; mimetype: string },
    opts: { kind?: 'mesh' | 'proxy'; twinId?: string; label?: string; twinKind?: string } = {},
  ) {
    const kind = opts.kind ?? 'mesh';
    if (role !== UserRole.ADMIN) {
      throw new ForbiddenException('Only e-resi staff can publish a 3D model');
    }

    const property = await this.prisma.property.findUnique({
      where: { slug },
      select: { id: true, name: true },
    });
    if (!property) throw new NotFoundException('Property not found');

    let summary: GlbSummary;
    try {
      summary = summariseGlb(file.buffer);
    } catch (err) {
      // The parser's messages say what to do about it, so they are surfaced
      // rather than replaced with something generic.
      throw new BadRequestException(
        err instanceof GlbError ? err.message : 'That file could not be read as a glTF binary.',
      );
    }

    /**
     * Refuse an oversized model before spending the upload.
     *
     * A .glb is stored as a raw file, and raw files are capped far lower than
     * images or video — 10 MB on Cloudinary's free tier. Sending 45 MB up to
     * be rejected wastes the developer's bandwidth and returns an error from
     * storage rather than one that says what to do, so the check happens here
     * where the numbers and the remedy are both known.
     */
    const limitMb = Number(process.env.RAW_UPLOAD_LIMIT_MB ?? 10);
    const sizeMb = summary.bytes / 1048576;

    if (limitMb > 0 && sizeMb > limitMb) {
      throw new BadRequestException(
        `That model is ${sizeMb.toFixed(1)} MB, over the ${limitMb} MB limit for 3D files. `
        + (summary.compression === 'none'
          ? 'It is uncompressed — Draco or Meshopt usually cuts geometry by 70–90%'
          : 'Decimate the mesh')
        + (summary.ktx2 ? '' : ' and bake textures to KTX2')
        + `, or raise the storage plan's raw file cap.`,
      );
    }

    const { url } = await this.storage.upload(
      'tours',
      file.originalname,
      file.buffer,
      file.mimetype,
    );

    /**
     * Replacing a named model, or adding another to the property.
     *
     * A twinId means "this capture again, re-exported"; its absence means a
     * new thing has been captured — the amenity deck, a show unit — and gets
     * its own record so a visitor can choose between them.
     */
    const existingCount = await this.prisma.digitalTwin.count({
      where: { propertyId: property.id },
    });

    const twin = opts.twinId
      ? await this.prisma.digitalTwin.update({
          where: { id: opts.twinId },
          data: kind === 'proxy'
            ? { proxyUrl: url }
            : { meshUrl: url, triangles: summary.triangles, fileSizeBytes: summary.bytes },
          include: { waypoints: { orderBy: { order: 'asc' } }, tags: true },
        })
      : await this.prisma.digitalTwin.create({
          data: {
            propertyId: property.id,
            label: opts.label?.trim() || 'Full building',
            kind: (opts.twinKind as never) ?? 'BUILDING',
            // The first model uploaded is the one the viewer opens on.
            isPrimary: existingCount === 0,
            order: existingCount,
            // A proxy alone is not a model, so it stands in until a full one
            // is uploaded against this record.
            ...(kind === 'proxy' ? { meshUrl: url, proxyUrl: url } : { meshUrl: url }),
            triangles: summary.triangles,
            fileSizeBytes: summary.bytes,
          },
          include: { waypoints: { orderBy: { order: 'asc' } }, tags: true },
        });

    // The flag now means something: a property claims a 3D tour because it has
    // a model, not because someone ticked a box.
    await this.prisma.property.update({
      where: { id: property.id },
      data: { has3DTour: true },
    });

    return { twin, summary, warnings: warningsFor(summary) };
  }

  async update(twinId: string, role: UserRole, dto: UpsertTwinDto) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');

    const twin = await this.requireTwin(twinId);

    // Only one model opens by default, so promoting one demotes the rest.
    if (dto.isPrimary) {
      await this.prisma.digitalTwin.updateMany({
        where: { propertyId: twin.propertyId },
        data: { isPrimary: false },
      });
    }

    return this.prisma.digitalTwin.update({
      where: { id: twin.id },
      data: {
        ...(dto.scale !== undefined && { scale: dto.scale }),
        ...(dto.scaleVerified !== undefined && { scaleVerified: dto.scaleVerified }),
        ...(dto.floors !== undefined && { floors: dto.floors }),
        ...(dto.originX !== undefined && { originX: dto.originX }),
        ...(dto.originY !== undefined && { originY: dto.originY }),
        ...(dto.originZ !== undefined && { originZ: dto.originZ }),
        ...(dto.capturedAt !== undefined && { capturedAt: new Date(dto.capturedAt) }),
        ...(dto.label !== undefined && { label: dto.label }),
        ...(dto.kind !== undefined && { kind: dto.kind as never }),
        ...(dto.posterUrl !== undefined && { posterUrl: dto.posterUrl }),
        ...(dto.isPrimary !== undefined && { isPrimary: dto.isPrimary }),
        ...(dto.order !== undefined && { order: dto.order }),
      },
      include: { waypoints: { orderBy: { order: 'asc' } }, tags: true },
    });
  }

  async remove(twinId: string, role: UserRole) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');

    const twin = await this.requireTwin(twinId);
    await this.prisma.digitalTwin.delete({ where: { id: twin.id } });

    const left = await this.prisma.digitalTwin.findMany({
      where: { propertyId: twin.propertyId },
      orderBy: [{ order: 'asc' }, { createdAt: 'asc' }],
    });

    // Removing the model a property opened on would otherwise leave the
    // switcher with nothing selected.
    if (twin.isPrimary && left.length) {
      await this.prisma.digitalTwin.update({
        where: { id: left[0].id },
        data: { isPrimary: true },
      });
    }

    // Nothing left to tour, so stop claiming there is.
    if (!left.length) {
      await this.prisma.property.update({
        where: { id: twin.propertyId },
        data: { has3DTour: false },
      });
    }

    return { message: 'Model removed' };
  }

  // ─── Waypoints ─────────────────────────────────────────────────────────────

  async addWaypoint(twinId: string, role: UserRole, dto: CreateWaypointDto) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');

    const twin = await this.requireTwin(twinId);
    const count = await this.prisma.twinWaypoint.count({ where: { twinId: twin.id } });

    return this.prisma.twinWaypoint.create({
      data: {
        twinId: twin.id,
        label: dto.label,
        caption: dto.caption,
        route: dto.route,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        lookX: dto.lookX ?? 0,
        lookY: dto.lookY ?? 0,
        lookZ: dto.lookZ ?? 0,
        floor: dto.floor ?? 0,
        order: dto.order ?? count,
      },
    });
  }

  async removeWaypoint(id: string, role: UserRole) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');
    await this.prisma.twinWaypoint.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Waypoint not found');
    });
    return { message: 'Stop removed' };
  }

  // ─── Tags ──────────────────────────────────────────────────────────────────

  async addTag(twinId: string, role: UserRole, dto: CreateTagDto) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');

    const twin = await this.requireTwin(twinId);
    return this.prisma.twinTag.create({
      data: {
        twinId: twin.id,
        title: dto.title,
        body: dto.body,
        posX: dto.posX,
        posY: dto.posY,
        posZ: dto.posZ,
        floor: dto.floor ?? 0,
      },
    });
  }

  async removeTag(id: string, role: UserRole) {
    if (role !== UserRole.ADMIN) throw new ForbiddenException('Admin only');
    await this.prisma.twinTag.delete({ where: { id } }).catch(() => {
      throw new NotFoundException('Tag not found');
    });
    return { message: 'Tag removed' };
  }

  private async requireTwin(twinId: string) {
    const twin = await this.prisma.digitalTwin.findUnique({ where: { id: twinId } });
    if (!twin) throw new NotFoundException('That 3D model could not be found');
    return twin;
  }
}

/**
 * What is wrong with a model that will still load.
 *
 * Warnings rather than rejections: a heavy model is a judgement call about the
 * audience, and blocking one would stop a legitimate upload the day someone
 * needs it. The numbers are stated so the call is informed.
 */
function warningsFor(s: GlbSummary): string[] {
  const out: string[] = [];

  if (s.triangles > TRIANGLE_BUDGET) {
    out.push(
      `${s.triangles.toLocaleString()} triangles is above the ${TRIANGLE_BUDGET.toLocaleString()} `
      + 'target — decimate before publishing, or expect this to stutter on a phone.',
    );
  }
  if (s.bytes > SIZE_BUDGET_BYTES) {
    out.push(
      `${(s.bytes / 1048576).toFixed(1)} MB is above the 25 MB ceiling for mobile data.`,
    );
  }
  if (s.compression === 'none') {
    out.push('Geometry is uncompressed — Draco or Meshopt typically cuts this by 70–90%.');
  }
  if (s.textures > 0 && !s.ktx2) {
    out.push('Textures are not KTX2, so they decompress to full size in GPU memory.');
  }

  return out;
}
