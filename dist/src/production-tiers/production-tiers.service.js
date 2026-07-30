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
exports.ProductionTiersService = exports.TIER_FEATURES = exports.TIER_PRICING = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
exports.TIER_PRICING = {
    LISTING_ONLY: 0,
    PHOTOGRAPHY: 15000,
    PHOTOGRAPHY_VIDEO: 35000,
    TOUR_CINEMATIC: 75000,
    TOUR_3D: 95000,
    TOUR_VR: 120000,
    FULL_PRODUCTION: 250000,
};
exports.TIER_FEATURES = {
    LISTING_ONLY: ['Basic listing', 'Up to 10 photos (self-upload)', 'Standard visibility'],
    PHOTOGRAPHY: ['Professional photography (up to 30 shots)', 'Edited gallery', 'Priority listing'],
    PHOTOGRAPHY_VIDEO: ['All Photography tier features', 'Professional property video (3–5 min)', 'YouTube + social cuts'],
    TOUR_CINEMATIC: ['All Photo+Video features', 'Cinematic VR-ready tour video', 'Scene tagging'],
    TOUR_3D: ['All Cinematic features', 'Interactive 3D walkthrough', 'Room-by-room navigation'],
    TOUR_VR: ['All 3D Tour features', 'Full VR headset experience', 'WebGL-optimised delivery'],
    FULL_PRODUCTION: ['All tiers combined', 'Aerial drone footage', 'Digital twin model', 'Dedicated production team'],
};
let ProductionTiersService = class ProductionTiersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async getPricing() {
        return Object.entries(exports.TIER_PRICING).map(([tier, price]) => ({
            tier,
            priceKES: price,
            features: exports.TIER_FEATURES[tier],
        }));
    }
    async getForProperty(propertySlug) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        const tier = await this.prisma.productionTier.findUnique({ where: { propertyId: property.id } });
        if (!tier)
            return { tier: client_1.ProductionTierType.LISTING_ONLY, propertyId: property.id, active: false };
        return tier;
    }
    async setTier(dto, userId, userRole) {
        const property = await this.prisma.property.findUnique({
            where: { slug: dto.propertySlug },
            include: { developer: true },
        });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return this.prisma.productionTier.upsert({
            where: { propertyId: property.id },
            create: {
                propertyId: property.id,
                tier: dto.tier,
                paidAmount: dto.paidAmount,
                expiresAt: dto.expiresAt ? new Date(dto.expiresAt) : undefined,
            },
            update: {
                tier: dto.tier,
                paidAmount: dto.paidAmount,
                ...(dto.expiresAt && { expiresAt: new Date(dto.expiresAt) }),
                activatedAt: new Date(),
            },
        });
    }
    async developerTiers(userId) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        return this.prisma.productionTier.findMany({
            where: { property: { developerId: developer.id } },
            include: { property: { select: { slug: true, name: true } } },
            orderBy: { activatedAt: 'desc' },
        });
    }
    async adminListAll() {
        return this.prisma.productionTier.findMany({
            include: { property: { select: { slug: true, name: true, developer: { select: { companyName: true } } } } },
            orderBy: { activatedAt: 'desc' },
        });
    }
};
exports.ProductionTiersService = ProductionTiersService;
exports.ProductionTiersService = ProductionTiersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], ProductionTiersService);
//# sourceMappingURL=production-tiers.service.js.map