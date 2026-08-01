import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { KybStatus, User, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { SubmitOnboardingDto } from './dto/submit-onboarding.dto.js';
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

  async submitOnboarding(userId: string, dto: SubmitOnboardingDto) {
    const profile = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!profile) throw new NotFoundException('Developer profile not found');

    const company = dto.company as Record<string, unknown>;
    const str = (v: unknown) => (typeof v === 'string' && v.trim() ? v.trim() : undefined);
    const year = Number.parseInt(String(company.yearEstablished ?? ''), 10);
    const projects = Number.parseInt(String(company.projectsCompleted ?? ''), 10);

    return this.prisma.developerProfile.update({
      where: { userId },
      data: {
        // promote known company fields onto the profile columns
        ...(str(company.companyName) && { companyName: str(company.companyName)! }),
        ...(str(company.longDescription ?? company.shortDescription) && {
          description: str(company.longDescription ?? company.shortDescription)!,
        }),
        ...(Number.isFinite(year) && year >= 1900 && { establishedYear: year }),
        ...(Number.isFinite(projects) && projects >= 0 && { completedProjects: projects }),
        ...(str(company.website) && { website: str(company.website)! }),
        // full wizard payload for admin review
        onboarding: dto as unknown as object,
        onboardingSubmittedAt: new Date(),
        ...(dto.verificationDocs && { kybDocuments: dto.verificationDocs as object }),
        // (re)enter the KYB review queue unless already approved
        ...(profile.kybStatus !== KybStatus.APPROVED && { kybStatus: KybStatus.PENDING }),
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
