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
exports.AmenitiesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let AmenitiesService = class AmenitiesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assertOwner(propertySlug, userId, userRole) {
        const property = await this.prisma.property.findUnique({
            where: { slug: propertySlug },
            include: { developer: true },
        });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        if (userRole !== client_1.UserRole.ADMIN && property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return property;
    }
    async create(propertySlug, userId, userRole, dto) {
        const property = await this.assertOwner(propertySlug, userId, userRole);
        return this.prisma.amenity.create({
            data: {
                propertyId: property.id,
                name: dto.name,
                type: dto.type,
                distance: dto.distance,
                latitude: dto.latitude,
                longitude: dto.longitude,
            },
        });
    }
    async findAll(propertySlug, type) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.amenity.findMany({
            where: { propertyId: property.id, ...(type && { type }) },
            orderBy: [{ type: 'asc' }, { name: 'asc' }],
        });
    }
    async bulkCreate(propertySlug, userId, userRole, dtos) {
        const property = await this.assertOwner(propertySlug, userId, userRole);
        return this.prisma.amenity.createMany({
            data: dtos.map((dto) => ({
                propertyId: property.id,
                name: dto.name,
                type: dto.type,
                distance: dto.distance,
                latitude: dto.latitude,
                longitude: dto.longitude,
            })),
        });
    }
    async remove(id, userId, userRole) {
        const amenity = await this.prisma.amenity.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!amenity)
            throw new common_1.NotFoundException('Amenity not found');
        if (userRole !== client_1.UserRole.ADMIN && amenity.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        await this.prisma.amenity.delete({ where: { id } });
        return { message: 'Amenity deleted' };
    }
    async removeAll(propertySlug, userId, userRole) {
        const property = await this.assertOwner(propertySlug, userId, userRole);
        const { count } = await this.prisma.amenity.deleteMany({ where: { propertyId: property.id } });
        return { message: `${count} amenity/amenities deleted` };
    }
};
exports.AmenitiesService = AmenitiesService;
exports.AmenitiesService = AmenitiesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], AmenitiesService);
//# sourceMappingURL=amenities.service.js.map