"use strict";
var __decorate = (this && this.__decorate) || function (decorators, target, key, desc) {
    var c = arguments.length, r = c < 3 ? target : desc === null ? desc = Object.getOwnPropertyDescriptor(target, key) : desc, d;
    if (typeof Reflect === "object" && typeof Reflect.decorate === "function") r = Reflect.decorate(decorators, target, key, desc);
    else for (var i = decorators.length - 1; i >= 0; i--) if (d = decorators[i]) r = (c < 3 ? d(r) : c > 3 ? d(target, key, r) : d(target, key)) || r;
    return c > 3 && r && Object.defineProperty(target, key, r), r;
};
var __metadata = (this && this.__metadata) || function (k, v) {
    if (typeof Reflect === "object" && typeof Reflect.metadata === "function") return Reflect.metadata(k, v);
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.MediaService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
const storage_service_js_1 = require("./storage.service.js");
let MediaService = class MediaService {
    prisma;
    storage;
    constructor(prisma, storage) {
        this.prisma = prisma;
        this.storage = storage;
    }
    async getPresignedUrl(dto) {
        return this.storage.presignedUploadUrl((dto.folder ?? 'properties'), dto.fileName, dto.mimeType);
    }
    async uploadFile(folder, file) {
        return this.storage.upload(folder, file.originalname, file.buffer, file.mimetype);
    }
    async addToProperty(propertySlug, userId, userRole, dto) {
        const property = await this.prisma.property.findUnique({
            where: { slug: propertySlug },
            include: { developer: true },
        });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
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
    async addToRentListing(rentListingId, userId, userRole, dto) {
        const listing = await this.prisma.rentListing.findUnique({
            where: { id: rentListingId },
            include: { developer: true },
        });
        if (!listing)
            throw new common_1.NotFoundException('Rent listing not found');
        if (userRole !== client_1.UserRole.ADMIN && listing.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this rent listing');
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
    async listForProperty(propertySlug, type) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.mediaAsset.findMany({
            where: { propertyId: property.id, ...(type && { type }) },
            orderBy: [{ isFeatured: 'desc' }, { order: 'asc' }, { createdAt: 'asc' }],
        });
    }
    async remove(id, userId, userRole) {
        const asset = await this.prisma.mediaAsset.findUnique({
            where: { id },
            include: {
                property: { include: { developer: true } },
                rentListing: { include: { developer: true } },
            },
        });
        if (!asset)
            throw new common_1.NotFoundException('Media asset not found');
        const ownerOfProperty = asset.property?.developer.userId === userId;
        const ownerOfListing = asset.rentListing?.developer.userId === userId;
        if (userRole !== client_1.UserRole.ADMIN && !ownerOfProperty && !ownerOfListing) {
            throw new common_1.ForbiddenException('You do not own this media asset');
        }
        const cdnBase = process.env.CDN_BASE_URL ?? '';
        const key = asset.url.replace(`${cdnBase}/`, '');
        await this.storage.delete(key);
        await this.prisma.mediaAsset.delete({ where: { id } });
        return { message: 'Media asset deleted' };
    }
    async reorder(propertySlug, userId, userRole, orderedIds) {
        const property = await this.prisma.property.findUnique({
            where: { slug: propertySlug },
            include: { developer: true },
        });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        await this.prisma.$transaction(orderedIds.map((id, index) => this.prisma.mediaAsset.update({ where: { id }, data: { order: index } })));
        return { message: 'Media reordered' };
    }
};
exports.MediaService = MediaService;
exports.MediaService = MediaService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService,
        storage_service_js_1.StorageService])
], MediaService);
//# sourceMappingURL=media.service.js.map