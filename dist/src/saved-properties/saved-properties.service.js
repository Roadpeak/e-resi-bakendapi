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
exports.SavedPropertiesService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let SavedPropertiesService = class SavedPropertiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async save(userId, propertySlug) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        const existing = await this.prisma.savedProperty.findUnique({
            where: { userId_propertyId: { userId, propertyId: property.id } },
        });
        if (existing)
            throw new common_1.ConflictException('Property already saved');
        return this.prisma.savedProperty.create({
            data: { userId, propertyId: property.id },
            include: { property: { select: { slug: true, name: true, heroImageUrl: true, city: true, priceFrom: true } } },
        });
    }
    async unsave(userId, propertySlug) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        const existing = await this.prisma.savedProperty.findUnique({
            where: { userId_propertyId: { userId, propertyId: property.id } },
        });
        if (!existing)
            throw new common_1.NotFoundException('Property not in saved list');
        await this.prisma.savedProperty.delete({
            where: { userId_propertyId: { userId, propertyId: property.id } },
        });
        return { message: 'Property removed from saved list' };
    }
    async findMine(userId, pagination) {
        const [data, total] = await Promise.all([
            this.prisma.savedProperty.findMany({
                where: { userId },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    property: {
                        select: {
                            id: true, slug: true, name: true, heroImageUrl: true,
                            city: true, category: true, priceFrom: true, priceTo: true,
                            hasCinematicTour: true, has3DTour: true, hasVRTour: true,
                            status: true,
                        },
                    },
                },
            }),
            this.prisma.savedProperty.count({ where: { userId } }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async isSaved(userId, propertySlug) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            return { saved: false };
        const saved = await this.prisma.savedProperty.findUnique({
            where: { userId_propertyId: { userId, propertyId: property.id } },
        });
        return { saved: !!saved };
    }
};
exports.SavedPropertiesService = SavedPropertiesService;
exports.SavedPropertiesService = SavedPropertiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], SavedPropertiesService);
//# sourceMappingURL=saved-properties.service.js.map