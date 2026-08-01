import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MediaType, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService, UploadFolder } from './storage.service.js';
import type { AddMediaDto } from './dto/add-media.dto.js';
import type { PresignUploadDto } from './dto/presign-upload.dto.js';

@Injectable()
export class MediaService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // ─── Presigned upload URL ──────────────────────────────────────────────────

  async getPresignedUrl(dto: PresignUploadDto) {
    return this.storage.presignedUploadUrl(
      (dto.folder ?? 'properties') as UploadFolder,
      dto.fileName,
      dto.mimeType,
    );
  }

  // ─── Server-side upload (multipart/form-data) ──────────────────────────────

  async uploadFile(
    folder: UploadFolder,
    file: Express.Multer.File,
  ) {
    return this.storage.upload(folder, file.originalname, file.buffer, file.mimetype);
  }

  // ─── Add media record to property ─────────────────────────────────────────

  async addToProperty(
    propertySlug: string,
    userId: string,
    userRole: UserRole,
    dto: AddMediaDto,
  ) {
    const property = await this.prisma.property.findUnique({
      where: { slug: propertySlug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    return this.prisma.mediaAsset.create({
      data: {
        propertyId: property.id,
        type: dto.type,
        url: dto.url,
        thumbnailUrl: dto.thumbnailUrl,
        title: dto.title,
        order: dto.order ?? 0,
        isFeatured: dto.isFeatured ?? false,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
      },
    });
  }

  // ─── Add media record to rent listing ─────────────────────────────────────

  async addToRentListing(
    rentListingId: string,
    userId: string,
    userRole: UserRole,
    dto: AddMediaDto,
  ) {
    const listing = await this.prisma.rentListing.findUnique({
      where: { id: rentListingId },
      include: { developer: true },
    });
    if (!listing) throw new NotFoundException('Rent listing not found');
    if (userRole !== UserRole.ADMIN && listing.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this rent listing');
    }

    return this.prisma.mediaAsset.create({
      data: {
        rentListingId,
        type: dto.type,
        url: dto.url,
        thumbnailUrl: dto.thumbnailUrl,
        title: dto.title,
        order: dto.order ?? 0,
        isFeatured: dto.isFeatured ?? false,
        sizeBytes: dto.sizeBytes,
        mimeType: dto.mimeType,
      },
    });
  }

  // ─── List media for a property ─────────────────────────────────────────────

  async listForProperty(propertySlug: string, type?: MediaType) {
    const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    return this.prisma.mediaAsset.findMany({
      where: { propertyId: property.id, ...(type && { type }) },
      orderBy: [{ isFeatured: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
    });
  }

  // ─── Delete media ──────────────────────────────────────────────────────────

  async remove(id: string, userId: string, userRole: UserRole) {
    const asset = await this.prisma.mediaAsset.findUnique({
      where: { id },
      include: {
        property: { include: { developer: true } },
        rentListing: { include: { developer: true } },
      },
    });
    if (!asset) throw new NotFoundException('Media asset not found');

    const ownerOfProperty = asset.property?.developer.userId === userId;
    const ownerOfListing = asset.rentListing?.developer.userId === userId;

    if (userRole !== UserRole.ADMIN && !ownerOfProperty && !ownerOfListing) {
      throw new ForbiddenException('You do not own this media asset');
    }

    // Derive the Cloudinary key from the delivery URL for deletion
    const key = this.storage.keyFromUrl(asset.url);
    if (key) await this.storage.delete(key);

    await this.prisma.mediaAsset.delete({ where: { id } });
    return { message: 'Media asset deleted' };
  }

  // ─── Reorder media ─────────────────────────────────────────────────────────

  async reorder(propertySlug: string, userId: string, userRole: UserRole, orderedIds: string[]) {
    const property = await this.prisma.property.findUnique({
      where: { slug: propertySlug },
      include: { developer: true },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (userRole !== UserRole.ADMIN && property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    await this.prisma.$transaction(
      orderedIds.map((id, index) =>
        this.prisma.mediaAsset.update({ where: { id }, data: { order: index } }),
      ),
    );

    return { message: 'Media reordered' };
  }
}
