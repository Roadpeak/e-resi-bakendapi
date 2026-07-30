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
exports.ConstructionUpdatesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let ConstructionUpdatesService = class ConstructionUpdatesService {
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
        return this.prisma.constructionUpdate.create({
            data: {
                propertyId: property.id,
                title: dto.title,
                description: dto.description,
                percentComplete: dto.percentComplete,
                images: dto.images ?? [],
                date: dto.date ? new Date(dto.date) : new Date(),
            },
        });
    }
    async findAll(propertySlug, pagination) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        const [data, total] = await Promise.all([
            this.prisma.constructionUpdate.findMany({
                where: { propertyId: property.id },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { date: 'desc' },
            }),
            this.prisma.constructionUpdate.count({ where: { propertyId: property.id } }),
        ]);
        return {
            data,
            meta: {
                total,
                page: pagination.page ?? 1,
                limit: pagination.limit ?? 20,
                totalPages: Math.ceil(total / (pagination.limit ?? 20)),
            },
        };
    }
    async update(id, userId, userRole, dto) {
        const update = await this.prisma.constructionUpdate.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!update)
            throw new common_1.NotFoundException('Construction update not found');
        if (userRole !== client_1.UserRole.ADMIN && update.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return this.prisma.constructionUpdate.update({
            where: { id },
            data: {
                ...(dto.title !== undefined && { title: dto.title }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.percentComplete !== undefined && { percentComplete: dto.percentComplete }),
                ...(dto.images !== undefined && { images: dto.images }),
                ...(dto.date !== undefined && { date: new Date(dto.date) }),
            },
        });
    }
    async remove(id, userId, userRole) {
        const update = await this.prisma.constructionUpdate.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!update)
            throw new common_1.NotFoundException('Construction update not found');
        if (userRole !== client_1.UserRole.ADMIN && update.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        await this.prisma.constructionUpdate.delete({ where: { id } });
        return { message: 'Construction update deleted' };
    }
};
exports.ConstructionUpdatesService = ConstructionUpdatesService;
exports.ConstructionUpdatesService = ConstructionUpdatesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], ConstructionUpdatesService);
//# sourceMappingURL=construction-updates.service.js.map