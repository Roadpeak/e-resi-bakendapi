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
exports.NotificationsService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let NotificationsService = class NotificationsService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async createNotification(userId, type, title, body, resourceId, resourceType) {
        return this.prisma.notification.create({
            data: { userId, type, title, body, resourceId, resourceType },
        });
    }
    async findMine(userId, pagination, unreadOnly = false) {
        const where = { userId, ...(unreadOnly && { read: false }) };
        const [data, total, unreadCount] = await Promise.all([
            this.prisma.notification.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit ?? 20,
                orderBy: { createdAt: 'desc' },
            }),
            this.prisma.notification.count({ where }),
            this.prisma.notification.count({ where: { userId, read: false } }),
        ]);
        return {
            data,
            unreadCount,
            meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
        };
    }
    async markRead(id, userId) {
        const notification = await this.prisma.notification.findUnique({ where: { id } });
        if (!notification)
            throw new common_1.NotFoundException('Notification not found');
        if (notification.userId !== userId)
            throw new common_1.NotFoundException('Notification not found');
        return this.prisma.notification.update({ where: { id }, data: { read: true } });
    }
    async markAllRead(userId) {
        const { count } = await this.prisma.notification.updateMany({
            where: { userId, read: false },
            data: { read: true },
        });
        return { message: `${count} notification(s) marked as read` };
    }
    async remove(id, userId) {
        const notification = await this.prisma.notification.findUnique({ where: { id } });
        if (!notification || notification.userId !== userId)
            throw new common_1.NotFoundException('Notification not found');
        await this.prisma.notification.delete({ where: { id } });
        return { message: 'Notification deleted' };
    }
    async unreadCount(userId) {
        const count = await this.prisma.notification.count({ where: { userId, read: false } });
        return { count };
    }
};
exports.NotificationsService = NotificationsService;
exports.NotificationsService = NotificationsService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], NotificationsService);
//# sourceMappingURL=notifications.service.js.map