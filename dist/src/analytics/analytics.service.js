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
exports.AnalyticsService = void 0;
const common_1 = require("@nestjs/common");
const client_1 = require("@prisma/client");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let AnalyticsService = class AnalyticsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async track(dto, userId) {
        return this.prisma.analyticsEvent.create({
            data: {
                type: dto.type,
                propertyId: dto.propertyId,
                userId,
                sessionId: dto.sessionId,
                source: dto.source,
                metadata: dto.metadata,
            },
        });
    }
    async propertyStats(propertySlug, days = 30) {
        const property = await this.prisma.property.findUnique({ where: { slug: propertySlug } });
        if (!property)
            return null;
        const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
        const [events, inquiriesCount, bookingsCount, savedCount] = await Promise.all([
            this.prisma.analyticsEvent.groupBy({
                by: ['type'],
                where: { propertyId: property.id, createdAt: { gte: since } },
                _count: { type: true },
            }),
            this.prisma.inquiry.count({ where: { propertyId: property.id, createdAt: { gte: since } } }),
            this.prisma.booking.count({ where: { propertyId: property.id, createdAt: { gte: since } } }),
            this.prisma.savedProperty.count({ where: { propertyId: property.id } }),
        ]);
        const eventMap = Object.fromEntries(events.map((e) => [e.type, e._count.type]));
        return {
            period: `last ${days} days`,
            views: eventMap[client_1.AnalyticsEventType.PAGE_VIEW] ?? 0,
            tourStarts: eventMap[client_1.AnalyticsEventType.TOUR_START] ?? 0,
            tourCompletes: eventMap[client_1.AnalyticsEventType.TOUR_COMPLETE] ?? 0,
            inquiries: inquiriesCount,
            bookings: bookingsCount,
            saved: savedCount,
        };
    }
    async developerStats(userId) {
        const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!developer)
            return null;
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [properties, activeListings, totalInquiries, pendingBookings, activeReservations] = await Promise.all([
            this.prisma.property.count({ where: { developerId: developer.id } }),
            this.prisma.property.count({ where: { developerId: developer.id, status: 'ACTIVE' } }),
            this.prisma.inquiry.count({
                where: {
                    OR: [
                        { property: { developerId: developer.id } },
                        { rentListing: { developerId: developer.id } },
                    ],
                    createdAt: { gte: since30d },
                },
            }),
            this.prisma.booking.count({
                where: { property: { developerId: developer.id }, status: 'PENDING' },
            }),
            this.prisma.reservation.count({
                where: {
                    unit: { property: { developerId: developer.id } },
                    stage: { notIn: ['TITLE_TRANSFERRED', 'CANCELLED'] },
                },
            }),
        ]);
        return {
            properties: { total: properties, active: activeListings },
            inquiries: { last30Days: totalInquiries },
            bookings: { pending: pendingBookings },
            reservations: { active: activeReservations },
        };
    }
    async platformStats() {
        const since30d = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const [users, properties, inquiries, bookings, reservations] = await Promise.all([
            this.prisma.user.groupBy({ by: ['role'], _count: { role: true } }),
            this.prisma.property.groupBy({ by: ['status'], _count: { status: true } }),
            this.prisma.inquiry.count({ where: { createdAt: { gte: since30d } } }),
            this.prisma.booking.count({ where: { createdAt: { gte: since30d } } }),
            this.prisma.reservation.count({ where: { stage: { notIn: ['TITLE_TRANSFERRED', 'CANCELLED'] } } }),
        ]);
        return {
            users: Object.fromEntries(users.map((u) => [u.role, u._count.role])),
            properties: Object.fromEntries(properties.map((p) => [p.status, p._count.status])),
            activity: { inquiries30d: inquiries, bookings30d: bookings, activeReservations: reservations },
        };
    }
};
exports.AnalyticsService = AnalyticsService;
exports.AnalyticsService = AnalyticsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], AnalyticsService);
//# sourceMappingURL=analytics.service.js.map