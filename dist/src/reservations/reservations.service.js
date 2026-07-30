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
exports.ReservationsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let ReservationsService = class ReservationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, userId) {
        const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
        if (!unit)
            throw new common_1.NotFoundException('Unit not found');
        if (unit.status !== client_1.UnitStatus.AVAILABLE) {
            throw new common_1.BadRequestException(`Unit is not available (status: ${unit.status})`);
        }
        const existing = await this.prisma.reservation.findFirst({
            where: {
                unitId: dto.unitId,
                stage: { in: [client_1.ReservationStage.RESERVED, client_1.ReservationStage.AGREEMENT_SIGNED, client_1.ReservationStage.DEPOSIT_PAID] },
                expiresAt: { gt: new Date() },
            },
        });
        if (existing)
            throw new common_1.BadRequestException('Unit already has an active reservation');
        const expiresAt = dto.expiresAt
            ? new Date(dto.expiresAt)
            : new Date(Date.now() + 48 * 60 * 60 * 1000);
        const [reservation] = await this.prisma.$transaction([
            this.prisma.reservation.create({
                data: { unitId: dto.unitId, userId, expiresAt },
                include: {
                    unit: { include: { property: { select: { slug: true, name: true } } } },
                },
            }),
            this.prisma.unit.update({ where: { id: dto.unitId }, data: { status: client_1.UnitStatus.RESERVED } }),
        ]);
        return reservation;
    }
    async findMine(userId, pagination) {
        const [data, total] = await Promise.all([
            this.prisma.reservation.findMany({
                where: { userId },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    unit: { include: { property: { select: { slug: true, name: true, heroImageUrl: true } } } },
                    documents: true,
                    payments: { orderBy: { createdAt: 'desc' }, take: 3 },
                },
            }),
            this.prisma.reservation.count({ where: { userId } }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findForDeveloper(userId, pagination) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const unitIds = await this.prisma.unit
            .findMany({
            where: { property: { developerId: developer.id } },
            select: { id: true },
        })
            .then((us) => us.map((u) => u.id));
        const where = { unitId: { in: unitIds } };
        const [data, total] = await Promise.all([
            this.prisma.reservation.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    unit: { include: { property: { select: { slug: true, name: true } } } },
                    user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                    payments: { orderBy: { createdAt: 'desc' }, take: 3 },
                },
            }),
            this.prisma.reservation.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findOne(id, userId, userRole) {
        const reservation = await this.prisma.reservation.findUnique({
            where: { id },
            include: {
                unit: { include: { property: { include: { developer: true } } } },
                user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
                documents: true,
                payments: { orderBy: { createdAt: 'desc' } },
            },
        });
        if (!reservation)
            throw new common_1.NotFoundException('Reservation not found');
        const isOwner = reservation.userId === userId;
        const isDeveloper = reservation.unit.property.developer.userId === userId;
        const isAdmin = userRole === client_1.UserRole.ADMIN;
        if (!isOwner && !isDeveloper && !isAdmin)
            throw new common_1.ForbiddenException('Access denied');
        return reservation;
    }
    async advanceStage(id, userId, userRole, stage) {
        const reservation = await this.findOne(id, userId, userRole);
        const isDeveloper = reservation.unit.property.developer.userId === userId;
        if (!isDeveloper && userRole !== client_1.UserRole.ADMIN)
            throw new common_1.ForbiddenException('Only the developer can advance reservation stage');
        const stageOrder = [
            client_1.ReservationStage.RESERVED,
            client_1.ReservationStage.AGREEMENT_SIGNED,
            client_1.ReservationStage.DEPOSIT_PAID,
            client_1.ReservationStage.FINAL_PAYMENT,
            client_1.ReservationStage.TITLE_TRANSFERRED,
        ];
        const currentIndex = stageOrder.indexOf(reservation.stage);
        const targetIndex = stageOrder.indexOf(stage);
        if (targetIndex <= currentIndex)
            throw new common_1.BadRequestException('Cannot move to an earlier or same stage');
        const updatedUnit = stage === client_1.ReservationStage.FINAL_PAYMENT || stage === client_1.ReservationStage.TITLE_TRANSFERRED
            ? this.prisma.unit.update({ where: { id: reservation.unitId }, data: { status: client_1.UnitStatus.SOLD } })
            : null;
        const [updated] = await this.prisma.$transaction([
            this.prisma.reservation.update({ where: { id }, data: { stage } }),
            ...(updatedUnit ? [updatedUnit] : []),
        ]);
        return updated;
    }
    async cancel(id, userId, userRole) {
        const reservation = await this.findOne(id, userId, userRole);
        if (reservation.stage === client_1.ReservationStage.TITLE_TRANSFERRED) {
            throw new common_1.BadRequestException('Cannot cancel a completed reservation');
        }
        await this.prisma.$transaction([
            this.prisma.reservation.delete({ where: { id } }),
            this.prisma.unit.update({ where: { id: reservation.unitId }, data: { status: client_1.UnitStatus.AVAILABLE } }),
        ]);
        return { message: 'Reservation cancelled and unit released' };
    }
    async findAll(pagination, stage) {
        const where = stage ? { stage } : {};
        const [data, total] = await Promise.all([
            this.prisma.reservation.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    unit: { include: { property: { select: { slug: true, name: true } } } },
                    user: { select: { id: true, firstName: true, lastName: true, email: true } },
                },
            }),
            this.prisma.reservation.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
};
exports.ReservationsService = ReservationsService;
exports.ReservationsService = ReservationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], ReservationsService);
//# sourceMappingURL=reservations.service.js.map