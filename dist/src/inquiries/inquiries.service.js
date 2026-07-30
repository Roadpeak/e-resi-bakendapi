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
exports.InquiriesService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let InquiriesService = class InquiriesService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async create(dto, userId) {
        if (!dto.propertySlug && !dto.rentListingId) {
            throw new common_1.BadRequestException('Either propertySlug or rentListingId is required');
        }
        let propertyId;
        if (dto.propertySlug) {
            const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
            if (!property)
                throw new common_1.NotFoundException('Property not found');
            propertyId = property.id;
        }
        if (dto.rentListingId) {
            const listing = await this.prisma.rentListing.findUnique({ where: { id: dto.rentListingId } });
            if (!listing)
                throw new common_1.NotFoundException('Rent listing not found');
        }
        return this.prisma.inquiry.create({
            data: {
                name: dto.name,
                email: dto.email,
                phone: dto.phone,
                message: dto.message,
                interestedUnit: dto.interestedUnit,
                ...(propertyId && { propertyId }),
                ...(dto.rentListingId && { rentListingId: dto.rentListingId }),
                ...(userId && { userId }),
            },
        });
    }
    async findForDeveloper(userId, pagination, status) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            throw new common_1.ForbiddenException('Developer profile required');
        const propertyIds = await this.prisma.property
            .findMany({ where: { developerId: developer.id }, select: { id: true } })
            .then((ps) => ps.map((p) => p.id));
        const rentListingIds = await this.prisma.rentListing
            .findMany({ where: { developerId: developer.id }, select: { id: true } })
            .then((rs) => rs.map((r) => r.id));
        const where = {
            OR: [
                { propertyId: { in: propertyIds } },
                { rentListingId: { in: rentListingIds } },
            ],
            ...(status && { status }),
        };
        const [data, total] = await Promise.all([
            this.prisma.inquiry.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    property: { select: { slug: true, name: true } },
                    rentListing: { select: { slug: true, name: true } },
                    replies: { orderBy: { createdAt: 'asc' } },
                },
            }),
            this.prisma.inquiry.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findMine(userId, pagination) {
        const [data, total] = await Promise.all([
            this.prisma.inquiry.findMany({
                where: { userId },
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    property: { select: { slug: true, name: true, heroImageUrl: true } },
                    rentListing: { select: { slug: true, name: true, heroImageUrl: true } },
                    replies: { orderBy: { createdAt: 'asc' } },
                },
            }),
            this.prisma.inquiry.count({ where: { userId } }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async findOne(id, requesterId, requesterRole) {
        const inquiry = await this.prisma.inquiry.findUnique({
            where: { id },
            include: {
                property: { include: { developer: true } },
                rentListing: { include: { developer: true } },
                replies: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } } } },
            },
        });
        if (!inquiry)
            throw new common_1.NotFoundException('Inquiry not found');
        const isOwner = inquiry.userId === requesterId;
        const isDeveloperOfProperty = inquiry.property?.developer.userId === requesterId;
        const isDeveloperOfListing = inquiry.rentListing?.developer.userId === requesterId;
        const isAdmin = requesterRole === client_1.UserRole.ADMIN;
        if (!isOwner && !isDeveloperOfProperty && !isDeveloperOfListing && !isAdmin) {
            throw new common_1.ForbiddenException('Access denied');
        }
        return inquiry;
    }
    async reply(id, senderId, senderRole, dto) {
        await this.findOne(id, senderId, senderRole);
        const [reply] = await this.prisma.$transaction([
            this.prisma.inquiryReply.create({
                data: { inquiryId: id, senderId, message: dto.message },
                include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
            }),
            this.prisma.inquiry.update({
                where: { id },
                data: { status: client_1.InquiryStatus.REPLIED },
            }),
        ]);
        return reply;
    }
    async updateStatus(id, userId, userRole, status) {
        await this.findOne(id, userId, userRole);
        return this.prisma.inquiry.update({ where: { id }, data: { status } });
    }
    async findAll(pagination, status) {
        const where = status ? { status } : {};
        const [data, total] = await Promise.all([
            this.prisma.inquiry.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
                include: {
                    property: { select: { slug: true, name: true } },
                    rentListing: { select: { slug: true, name: true } },
                    _count: { select: { replies: true } },
                },
            }),
            this.prisma.inquiry.count({ where }),
        ]);
        return {
            data,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
};
exports.InquiriesService = InquiriesService;
exports.InquiriesService = InquiriesService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], InquiriesService);
//# sourceMappingURL=inquiries.service.js.map