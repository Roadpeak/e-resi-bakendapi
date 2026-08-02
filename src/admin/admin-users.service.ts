import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { KybStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Users ────────────────────────────────────────────────────────────────

  async list(
    pagination: PaginationDto,
    filters: { role?: UserRole; q?: string; status?: 'active' | 'suspended'; verified?: string } = {},
  ) {
    const where = {
      ...(filters.role && { role: filters.role }),
      ...(filters.status === 'active' && { isActive: true }),
      ...(filters.status === 'suspended' && { isActive: false }),
      ...(filters.verified === 'true' && { emailVerified: true }),
      ...(filters.verified === 'false' && { emailVerified: false }),
      ...(filters.q && {
        OR: [
          { email: { contains: filters.q, mode: 'insensitive' as const } },
          { firstName: { contains: filters.q, mode: 'insensitive' as const } },
          { lastName: { contains: filters.q, mode: 'insensitive' as const } },
        ],
      }),
    };

    const [data, total] = await Promise.all([
      this.prisma.user.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
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
          suspendedAt: true,
          suspendedReason: true,
          lastLoginAt: true,
          createdAt: true,
          developerProfile: { select: { id: true, companyName: true, kybStatus: true } },
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

  async detail(id: string) {
    const user = await this.prisma.user.findUnique({
      where: { id },
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
        suspendedAt: true,
        suspendedReason: true,
        lastLoginAt: true,
        createdAt: true,
        developerProfile: true,
        _count: {
          select: { reservations: true, savedProperties: true, payments: true },
        },
      },
    });
    if (!user) throw new NotFoundException('User not found');
    return user;
  }

  async setSuspended(id: string, suspended: boolean, reason?: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    // Locking out the last admin would leave nobody able to unlock anything.
    if (suspended && before.role === UserRole.ADMIN) {
      const admins = await this.prisma.user.count({
        where: { role: UserRole.ADMIN, isActive: true },
      });
      if (admins <= 1) throw new BadRequestException('Cannot suspend the last active admin');
    }

    const after = await this.prisma.user.update({
      where: { id },
      data: {
        isActive: !suspended,
        suspendedAt: suspended ? new Date() : null,
        suspendedReason: suspended ? (reason ?? null) : null,
      },
    });
    return { before, after };
  }

  async setRole(id: string, role: UserRole) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    if (before.role === UserRole.ADMIN && role !== UserRole.ADMIN) {
      const admins = await this.prisma.user.count({ where: { role: UserRole.ADMIN } });
      if (admins <= 1) throw new BadRequestException('Cannot demote the last admin');
    }
    // A developer account needs a company profile to function.
    if (role === UserRole.DEVELOPER) {
      const profile = await this.prisma.developerProfile.findUnique({ where: { userId: id } });
      if (!profile) {
        await this.prisma.developerProfile.create({
          data: {
            userId: id,
            companyName: `${before.firstName ?? ''} ${before.lastName ?? ''}`.trim() || before.email,
          },
        });
      }
    }
    const after = await this.prisma.user.update({ where: { id }, data: { role } });
    return { before, after };
  }

  async verifyEmail(id: string) {
    const before = await this.prisma.user.findUnique({ where: { id } });
    if (!before) throw new NotFoundException('User not found');
    const after = await this.prisma.user.update({
      where: { id },
      data: { emailVerified: true, emailVerifyToken: null },
    });
    return { before, after };
  }

  // ─── Developers ───────────────────────────────────────────────────────────

  async listDevelopers(pagination: PaginationDto, kybStatus?: KybStatus) {
    const where = kybStatus ? { kybStatus } : {};
    const [data, total] = await Promise.all([
      this.prisma.developerProfile.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: {
            select: { id: true, email: true, firstName: true, lastName: true, isActive: true },
          },
          _count: { select: { properties: true, rentListings: true } },
        },
      }),
      this.prisma.developerProfile.count({ where }),
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

  async setKyb(profileId: string, status: KybStatus, notes?: string) {
    const before = await this.prisma.developerProfile.findUnique({ where: { id: profileId } });
    if (!before) throw new NotFoundException('Developer profile not found');
    const after = await this.prisma.developerProfile.update({
      where: { id: profileId },
      data: {
        kybStatus: status,
        kybReviewedAt: new Date(),
        ...(notes !== undefined && { kybDocuments: { ...(before.kybDocuments as object ?? {}), reviewNotes: notes } }),
      },
    });
    return { before, after };
  }
}
