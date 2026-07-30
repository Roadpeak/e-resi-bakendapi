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
exports.UsersService = void 0;
const common_1 = require("@nestjs/common");
const prisma_service_js_1 = require("../prisma/prisma.service.js");
let UsersService = class UsersService {
    prisma;
    constructor(prisma) {
        this.prisma = prisma;
    }
    async findAll(pagination, role) {
        const where = role ? { role } : {};
        const [data, total] = await Promise.all([
            this.prisma.user.findMany({
                where,
                skip: pagination.skip,
                take: pagination.limit,
                orderBy: { createdAt: 'desc' },
                select: {
                    id: true,
                    email: true,
                    firstName: true,
                    lastName: true,
                    role: true,
                    phone: true,
                    avatarUrl: true,
                    emailVerified: true,
                    isActive: true,
                    lastLoginAt: true,
                    createdAt: true,
                    developerProfile: { select: { companyName: true, kybStatus: true } },
                },
            }),
            this.prisma.user.count({ where }),
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
    async findOne(id) {
        const user = await this.prisma.user.findUnique({
            where: { id },
            include: { developerProfile: true },
        });
        if (!user)
            throw new common_1.NotFoundException('User not found');
        const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
        return safe;
    }
    async setActive(id, isActive) {
        await this.findOne(id);
        const updated = await this.prisma.user.update({ where: { id }, data: { isActive } });
        return { id: updated.id, isActive: updated.isActive };
    }
    async updateKybStatus(developerId, status) {
        const profile = await this.prisma.developerProfile.findUnique({ where: { id: developerId } });
        if (!profile)
            throw new common_1.NotFoundException('Developer profile not found');
        return this.prisma.developerProfile.update({
            where: { id: developerId },
            data: { kybStatus: status, kybReviewedAt: new Date() },
        });
    }
    async getMyDeveloperProfile(userId) {
        const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Developer profile not found');
        return profile;
    }
    async updateMyDeveloperProfile(userId, dto) {
        const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
        if (!profile)
            throw new common_1.NotFoundException('Developer profile not found');
        return this.prisma.developerProfile.update({
            where: { userId },
            data: {
                ...(dto.companyName !== undefined && { companyName: dto.companyName }),
                ...(dto.description !== undefined && { description: dto.description }),
                ...(dto.establishedYear !== undefined && { establishedYear: dto.establishedYear }),
                ...(dto.website !== undefined && { website: dto.website }),
                ...(dto.logoUrl !== undefined && { logoUrl: dto.logoUrl }),
            },
        });
    }
    async getDeveloperProfileByUserId(userId) {
        const profile = await this.prisma.developerProfile.findUnique({
            where: { userId },
            include: {
                properties: {
                    where: { status: 'ACTIVE' },
                    select: { id: true, slug: true, name: true, heroImageUrl: true, city: true, priceFrom: true },
                    take: 6,
                },
            },
        });
        if (!profile)
            throw new common_1.NotFoundException('Developer profile not found');
        return profile;
    }
};
exports.UsersService = UsersService;
exports.UsersService = UsersService = __decorate([
    (0, common_1.Injectable)(),
    __metadata("design:paramtypes", [prisma_service_js_1.PrismaService])
], UsersService);
//# sourceMappingURL=users.service.js.map