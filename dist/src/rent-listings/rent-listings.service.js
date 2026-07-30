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
exports.RentListingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
function slugify(name) {
    return name.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim().replace(/\s+/g, '-').slice(0, 80);
}
async function uniqueSlug(prisma, base) {
    let slug = base;
    let counter = 1;
    while (await prisma.rentListing.findUnique({ where: { slug } })) {
        slug = `${base}-${counter++}`;
    }
    return slug;
}
let RentListingsService = class RentListingsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assertOwner(rentListingId, userId, userRole) {
        const listing = await this.prisma.rentListing.findUnique({
            where: { id: rentListingId },
            include: { developer: true },
        });
        if (!listing)
            throw new common_1.NotFoundException('Rent listing not found');
        if (userRole !== client_1.UserRole.ADMIN && listing.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this rent listing');
        }
        return listing;
    }
    async create(userId, dto) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (property.developerId !== developer.id)
            throw new common_1.ForbiddenException('Property does not belong to you');
        const slug = await uniqueSlug(this.prisma, slugify(dto.name));
        return this.prisma.rentListing.create({
            data: {
                slug,
                name: dto.name,
                tagline: dto.tagline,
                description: dto.description,
                propertyId: property.id,
                developerId: developer.id,
                furnishing: dto.furnishing ?? 'UNFURNISHED',
                neighborhood: dto.neighborhood,
                city: dto.city ?? property.city,
                priceFrom: dto.priceFrom,
                priceTo: dto.priceTo,
                heroImageUrl: dto.heroImageUrl,
                availableFrom: dto.availableFrom ? new Date(dto.availableFrom) : undefined,
                minLeaseTerm: dto.minLeaseTerm ?? 12,
                tags: dto.tags ?? [],
            },
        });
    }
    async findAll(pagination, city, q) {
        const where = {
            status: { not: client_1.RentListingStatus.ARCHIVED },
            ...(city && { city: { contains: city, mode: 'insensitive' } }),
            ...(q && {
                OR: [
                    { name: { contains: q, mode: 'insensitive' } },
                    { tagline: { contains: q, mode: 'insensitive' } },
                ],
            }),
        };
        const [data, total] = await Promise.all([
            this.prisma.rentListing.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit,
                orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
                include: {
                    developer: { select: { companyName: true, logoUrl: true } },
                    rentUnits: { select: { label: true, pricePerMonth: true, available: true, total: true, bedrooms: true } },
                },
            }),
            this.prisma.rentListing.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findBySlug(slug) {
        const listing = await this.prisma.rentListing.findUnique({
            where: { slug },
            include: {
                developer: true,
                property: { select: { id: true, slug: true, name: true, heroImageUrl: true, has3DTour: true, hasCinematicTour: true } },
                rentUnits: true,
                media: { orderBy: { order: 'asc' } },
                inquiries: false,
            },
        });
        if (!listing || listing.status === 'ARCHIVED')
            throw new common_1.NotFoundException('Rent listing not found');
        return listing;
    }
    async findMyListings(userId, pagination) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const [data, total] = await Promise.all([
            this.prisma.rentListing.findMany({
                where: { developerId: developer.id },
                skip: pagination.skip,
                take: pagination.limit,
                orderBy: { createdAt: 'desc' },
                include: { rentUnits: true, _count: { select: { inquiries: true } } },
            }),
            this.prisma.rentListing.count({ where: { developerId: developer.id } }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page, limit: pagination.limit, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async update(id, userId, userRole, dto) {
        await this.assertOwner(id, userId, userRole);
        return this.prisma.rentListing.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.tagline !== undefined && { tagline: dto.tagline }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.furnishing !== undefined && { furnishing: dto.furnishing }),
                ...(dto.neighborhood !== undefined && { neighborhood: dto.neighborhood }),
                ...(dto.city !== undefined && { city: dto.city }),
                ...(dto.priceFrom !== undefined && { priceFrom: dto.priceFrom }),
                ...(dto.priceTo !== undefined && { priceTo: dto.priceTo }),
                ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
                ...(dto.availableFrom !== undefined && { availableFrom: new Date(dto.availableFrom) }),
                ...(dto.minLeaseTerm !== undefined && { minLeaseTerm: dto.minLeaseTerm }),
                ...(dto.tags !== undefined && { tags: dto.tags }),
            },
        });
    }
    async setStatus(id, userId, userRole, status) {
        await this.assertOwner(id, userId, userRole);
        return this.prisma.rentListing.update({ where: { id }, data: { status } });
    }
    async addRentUnit(rentListingId, userId, userRole, dto) {
        await this.assertOwner(rentListingId, userId, userRole);
        return this.prisma.rentUnit.create({
            data: {
                rentListingId,
                label: dto.label,
                bedrooms: dto.bedrooms ?? 1,
                bathrooms: dto.bathrooms ?? 1,
                sqm: dto.sqm,
                pricePerMonth: dto.pricePerMonth,
                available: dto.available ?? 0,
                total: dto.total ?? 1,
                furnishing: dto.furnishing ?? 'UNFURNISHED',
                features: dto.features ?? [],
            },
        });
    }
    async removeRentUnit(rentUnitId, userId, userRole) {
        const unit = await this.prisma.rentUnit.findUnique({
            where: { id: rentUnitId },
            include: { rentListing: { include: { developer: true } } },
        });
        if (!unit)
            throw new common_1.NotFoundException('Rent unit not found');
        if (userRole !== client_1.UserRole.ADMIN && unit.rentListing.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this rent unit');
        }
        await this.prisma.rentUnit.delete({ where: { id: rentUnitId } });
        return { message: 'Rent unit removed' };
    }
};
exports.RentListingsService = RentListingsService;
exports.RentListingsService = RentListingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], RentListingsService);
//# sourceMappingURL=rent-listings.service.js.map