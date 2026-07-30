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
exports.PropertiesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
function slugify(name) {
    return name
        .toLowerCase()
        .replace(/[^a-z0-9\s-]/g, '')
        .trim()
        .replace(/\s+/g, '-')
        .slice(0, 80);
}
async function uniqueSlug(prisma, base) {
    let slug = base;
    let counter = 1;
    while (await prisma.property.findUnique({ where: { slug } })) {
        slug = `${base}-${counter++}`;
    }
    return slug;
}
let PropertiesService = class PropertiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, dto) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const slug = await uniqueSlug(this.prisma, slugify(dto.name));
        return this.prisma.property.create({
            data: {
                slug,
                name: dto.name,
                tagline: dto.tagline,
                description: dto.description,
                category: dto.category,
                developerId: developer.id,
                neighborhood: dto.neighborhood,
                city: dto.city ?? 'Nairobi',
                county: dto.county,
                latitude: dto.latitude,
                longitude: dto.longitude,
                heroImageUrl: dto.heroImageUrl,
                heroVideoUrl: dto.heroVideoUrl,
                priceFrom: dto.priceFrom,
                priceTo: dto.priceTo,
                tags: dto.tags ?? [],
                completionDate: dto.completionDate ? new Date(dto.completionDate) : undefined,
            },
        });
    }
    async findAll(query) {
        const where = {
            status: query.status ?? client_1.PropertyStatus.ACTIVE,
            ...(query.category && { category: query.category }),
            ...(query.city && { city: { contains: query.city, mode: 'insensitive' } }),
            ...(query.neighborhood && { neighborhood: { contains: query.neighborhood, mode: 'insensitive' } }),
            ...(query.q && {
                OR: [
                    { name: { contains: query.q, mode: 'insensitive' } },
                    { tagline: { contains: query.q, mode: 'insensitive' } },
                    { description: { contains: query.q, mode: 'insensitive' } },
                ],
            }),
        };
        const [data, total] = await Promise.all([
            this.prisma.property.findMany({
                where,
                skip: query.skip,
                take: query.limit,
                orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }],
                include: {
                    developer: { select: { companyName: true, logoUrl: true } },
                    _count: { select: { units: true } },
                },
            }),
            this.prisma.property.count({ where }),
        ]);
        return {
            data,
            meta: {
                total,
                page: query.page ?? 1,
                limit: query.limit ?? 20,
                totalPages: Math.ceil(total / (query.limit ?? 20)),
            },
        };
    }
    async findBySlug(slug) {
        const property = await this.prisma.property.findUnique({
            where: { slug },
            include: {
                developer: true,
                units: { orderBy: { price: 'asc' } },
                floorPlans: true,
                amenities: true,
                media: { orderBy: { order: 'asc' } },
                cinematicScenes: { orderBy: { order: 'asc' } },
                tourSections3D: { include: { scenes: true }, orderBy: { order: 'asc' } },
                tourScenesVR: { orderBy: { order: 'asc' } },
                constructionUpdates: { orderBy: { date: 'desc' }, take: 5 },
                rentListings: { where: { status: { not: 'ARCHIVED' } } },
                _count: { select: { savedBy: true, inquiries: true } },
            },
        });
        if (!property || property.status === client_1.PropertyStatus.ARCHIVED) {
            throw new common_1.NotFoundException('Property not found');
        }
        return property;
    }
    async findMyProperties(userId, query) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const where = {
            developerId: developer.id,
            ...(query.status && { status: query.status }),
            ...(query.category && { category: query.category }),
            ...(query.q && {
                OR: [
                    { name: { contains: query.q, mode: 'insensitive' } },
                    { tagline: { contains: query.q, mode: 'insensitive' } },
                ],
            }),
        };
        const [data, total] = await Promise.all([
            this.prisma.property.findMany({
                where,
                skip: query.skip,
                take: query.limit,
                orderBy: { createdAt: 'desc' },
                include: { _count: { select: { units: true, inquiries: true } } },
            }),
            this.prisma.property.count({ where }),
        ]);
        return {
            data,
            meta: {
                total,
                page: query.page ?? 1,
                limit: query.limit ?? 20,
                totalPages: Math.ceil(total / (query.limit ?? 20)),
            },
        };
    }
    async update(slug, userId, userRole, dto) {
        const property = await this.prisma.property.findUnique({ where: { slug }, include: { developer: true } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return this.prisma.property.update({
            where: { slug },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.tagline !== undefined && { tagline: dto.tagline }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.category !== undefined && { category: dto.category }),
                ...(dto.neighborhood !== undefined && { neighborhood: dto.neighborhood }),
                ...(dto.city !== undefined && { city: dto.city }),
                ...(dto.county !== undefined && { county: dto.county }),
                ...(dto.latitude !== undefined && { latitude: dto.latitude }),
                ...(dto.longitude !== undefined && { longitude: dto.longitude }),
                ...(dto.heroImageUrl !== undefined && { heroImageUrl: dto.heroImageUrl }),
                ...(dto.heroVideoUrl !== undefined && { heroVideoUrl: dto.heroVideoUrl }),
                ...(dto.priceFrom !== undefined && { priceFrom: dto.priceFrom }),
                ...(dto.priceTo !== undefined && { priceTo: dto.priceTo }),
                ...(dto.tags !== undefined && { tags: dto.tags }),
                ...(dto.completionDate !== undefined && { completionDate: new Date(dto.completionDate) }),
            },
        });
    }
    async setStatus(slug, userId, userRole, status) {
        const property = await this.prisma.property.findUnique({ where: { slug }, include: { developer: true } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return this.prisma.property.update({ where: { slug }, data: { status } });
    }
    async archive(slug, userId, userRole) {
        return this.setStatus(slug, userId, userRole, client_1.PropertyStatus.ARCHIVED);
    }
};
exports.PropertiesService = PropertiesService;
exports.PropertiesService = PropertiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], PropertiesService);
//# sourceMappingURL=properties.service.js.map