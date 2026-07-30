import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KybStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { UpdateDeveloperProfileDto } from './dto/update-developer-profile.dto.js';

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Admin: list all users ────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, role?: UserRole) {
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

  // ─── Admin: get single user ───────────────────────────────────────────────

  async findOne(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
      include: { developerProfile: true },
    });
    if (!user) throw new NotFoundException('User not found');
    const { password, refreshToken, emailVerifyToken, passwordResetToken, passwordResetExpiry, ...safe } = user;
    return safe;
  }

  // ─── Admin: toggle active ─────────────────────────────────────────────────

  async setActive(id: string, isActive: boolean) {
    await this.findOne(id);
    const updated = await this.prisma.user.update({ where: { id }, data: { isActive } });
    return { id: updated.id, isActive: updated.isActive };
  }

  // ─── Admin: update KYB status ─────────────────────────────────────────────

  async updateKybStatus(developerId: string, status: KybStatus) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { id: developerId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return this.prisma.developerProfile.update({
      where: { id: developerId },
      data: { kybStatus: status, kybReviewedAt: new Date() },
    });
  }

  // ─── Developer: get own profile ───────────────────────────────────────────

  async getMyDeveloperProfile(userId: string) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
    return profile;
  }

  // ─── Developer: update own profile ───────────────────────────────────────

  async updateMyDeveloperProfile(userId: string, dto: UpdateDeveloperProfileDto) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');
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

  // ─── Public: get developer profile by userId ─────────────────────────────

  async getDeveloperProfileByUserId(userId: string) {
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
    if (!profile) throw new NotFoundException('Developer profile not found');
    return profile;
  }
}
