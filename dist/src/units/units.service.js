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
exports.UnitsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let UnitsService = class UnitsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async assertPropertyOwner(propertySlug, userId, userRole) {
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
        const property = await this.assertPropertyOwner(propertySlug, userId, userRole);
        return this.prisma.unit.create({
            data: {
                propertyId: property.id,
                name: dto.name,
                floor: dto.floor,
                bedrooms: dto.bedrooms ?? 1,
                bathrooms: dto.bathrooms ?? 1,
                sqm: dto.sqm,
                price: dto.price,
                status: dto.status ?? 'AVAILABLE',
                features: dto.features ?? [],
            },
        });
    }
    async findAll(propertySlug) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.unit.findMany({
            where: { propertyId: property.id },
            orderBy: [{ floor: 'asc' }, { price: 'asc' }],
        });
    }
    async findOne(id) {
        const unit = await this.prisma.unit.findUnique({ where: { id } });
        if (!unit)
            throw new common_1.NotFoundException('Unit not found');
        return unit;
    }
    async update(id, userId, userRole, dto) {
        const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
        if (!unit)
            throw new common_1.NotFoundException('Unit not found');
        if (userRole !== client_1.UserRole.ADMIN && unit.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this unit');
        }
        return this.prisma.unit.update({
            where: { id },
            data: {
                ...(dto.name !== undefined && { name: dto.name }),
                ...(dto.floor !== undefined && { floor: dto.floor }),
                ...(dto.bedrooms !== undefined && { bedrooms: dto.bedrooms }),
                ...(dto.bathrooms !== undefined && { bathrooms: dto.bathrooms }),
                ...(dto.sqm !== undefined && { sqm: dto.sqm }),
                ...(dto.price !== undefined && { price: dto.price }),
                ...(dto.status !== undefined && { status: dto.status }),
                ...(dto.features !== undefined && { features: dto.features }),
            },
        });
    }
    async remove(id, userId, userRole) {
        const unit = await this.prisma.unit.findUnique({ where: { id }, include: { property: { include: { developer: true } } } });
        if (!unit)
            throw new common_1.NotFoundException('Unit not found');
        if (userRole !== client_1.UserRole.ADMIN && unit.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this unit');
        }
        await this.prisma.unit.delete({ where: { id } });
        return { message: 'Unit deleted' };
    }
};
exports.UnitsService = UnitsService;
exports.UnitsService = UnitsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], UnitsService);
//# sourceMappingURL=units.service.js.map