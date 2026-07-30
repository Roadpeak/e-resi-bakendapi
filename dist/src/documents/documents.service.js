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
exports.DocumentsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let DocumentsService = class DocumentsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(userId, dto) {
        if (dto.reservationId) {
            const reservation = await this.prisma.reservation.findUnique({
                where: { id: dto.reservationId },
                include: { unit: { include: { property: { include: { developer: true } } } } },
            });
            if (!reservation)
                throw new common_1.NotFoundException('Reservation not found');
            const isOwner = reservation.userId === userId;
            const isDeveloper = reservation.unit.property.developer.userId === userId;
            if (!isOwner && !isDeveloper)
                throw new common_1.ForbiddenException('Access denied to this reservation');
        }
        return this.prisma.document.create({
            data: {
                userId,
                name: dto.name,
                url: dto.url,
                type: dto.type,
                sizeBytes: dto.sizeBytes,
                reservationId: dto.reservationId,
            },
        });
    }
    async findMine(userId, pagination) {
        const [data, total] = await Promise.all([
            this.prisma.document.findMany({
                where: { userId },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    reservation: {
                        select: {
                            id: true,
                            stage: true,
                            unit: { select: { name: true, property: { select: { slug: true, name: true } } } },
                        },
                    },
                },
            }),
            this.prisma.document.count({ where: { userId } }),
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
    async findForReservation(reservationId, userId, userRole) {
        const reservation = await this.prisma.reservation.findUnique({
            where: { id: reservationId },
            include: { unit: { include: { property: { include: { developer: true } } } } },
        });
        if (!reservation)
            throw new common_1.NotFoundException('Reservation not found');
        const isOwner = reservation.userId === userId;
        const isDeveloper = reservation.unit.property.developer.userId === userId;
        const isAdmin = userRole === client_1.UserRole.ADMIN;
        if (!isOwner && !isDeveloper && !isAdmin)
            throw new common_1.ForbiddenException('Access denied');
        return this.prisma.document.findMany({
            where: { reservationId },
            orderBy: { createdAt: 'desc' },
        });
    }
    async remove(id, userId, userRole) {
        const doc = await this.prisma.document.findUnique({ where: { id } });
        if (!doc)
            throw new common_1.NotFoundException('Document not found');
        if (userRole !== client_1.UserRole.ADMIN && doc.userId !== userId) {
            throw new common_1.ForbiddenException('You do not own this document');
        }
        await this.prisma.document.delete({ where: { id } });
        return { message: 'Document deleted' };
    }
    async findAll(pagination) {
        const [data, total] = await Promise.all([
            this.prisma.document.findMany({
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                    reservation: { select: { id: true, stage: true } },
                },
            }),
            this.prisma.document.count(),
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
};
exports.DocumentsService = DocumentsService;
exports.DocumentsService = DocumentsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], DocumentsService);
//# sourceMappingURL=documents.service.js.map