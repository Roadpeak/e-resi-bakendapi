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
exports.BookingsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let BookingsService = class BookingsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, userId) {
        const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
        if (!property)
            throw new common_1.NotFoundException('Property not found');
        return this.prisma.booking.create({
            data: {
                propertyId: property.id,
                name: dto.name,
                email: dto.email,
                phone: dto.phone,
                date: new Date(dto.date),
                time: dto.time,
                type: dto.type,
                message: dto.message,
                ...(userId && { userId }),
            },
            include: {
                property: { select: { slug: true, name: true, heroImageUrl: true } },
            },
        });
    }
    async findMine(userId, pagination) {
        const [data, total] = await Promise.all([
            this.prisma.booking.findMany({
                where: { userId },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { date: 'desc' },
                include: { property: { select: { slug: true, name: true, heroImageUrl: true, city: true } } },
            }),
            this.prisma.booking.count({ where: { userId } }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findForDeveloper(userId, pagination, status) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const propertyIds = await this.prisma.property
            .findMany({ where: { developerId: developer.id }, select: { id: true } })
            .then((ps) => ps.map((p) => p.id));
        const where = {
            propertyId: { in: propertyIds },
            ...(status && { status }),
        };
        const [data, total] = await Promise.all([
            this.prisma.booking.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: [{ date: 'asc' }, { time: 'asc' }],
                include: { property: { select: { slug: true, name: true } } },
            }),
            this.prisma.booking.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async updateStatus(id, userId, userRole, status, meetingUrl) {
        const booking = await this.prisma.booking.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!booking)
            throw new common_1.NotFoundException('Booking not found');
        if (userRole !== client_1.UserRole.ADMIN && booking.property.developer.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this property');
        }
        return this.prisma.booking.update({
            where: { id },
            data: {
                status,
                ...(meetingUrl && { meetingUrl }),
            },
        });
    }
    async findAll(pagination, status) {
        const where = status ? { status } : {};
        const [data, total] = await Promise.all([
            this.prisma.booking.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: { property: { select: { slug: true, name: true } } },
            }),
            this.prisma.booking.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async cancel(id, userId, userRole) {
        const booking = await this.prisma.booking.findUnique({
            where: { id },
            include: { property: { include: { developer: true } } },
        });
        if (!booking)
            throw new common_1.NotFoundException('Booking not found');
        const isOwner = booking.userId === userId;
        const isDeveloper = booking.property.developer.userId === userId;
        const isAdmin = userRole === client_1.UserRole.ADMIN;
        if (!isOwner && !isDeveloper && !isAdmin)
            throw new common_1.ForbiddenException('Access denied');
        if (booking.status === client_1.BookingStatus.CANCELLED)
            throw new common_1.ForbiddenException('Booking already cancelled');
        return this.prisma.booking.update({ where: { id }, data: { status: client_1.BookingStatus.CANCELLED } });
    }
};
exports.BookingsService = BookingsService;
exports.BookingsService = BookingsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], BookingsService);
//# sourceMappingURL=bookings.service.js.map