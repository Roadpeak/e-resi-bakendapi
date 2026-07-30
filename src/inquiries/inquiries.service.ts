import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { InquiryStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateInquiryDto } from './dto/create-inquiry.dto.js';
import type { ReplyInquiryDto } from './dto/reply-inquiry.dto.js';

@Injectable()
export class InquiriesService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Submit (public / authenticated) ─────────────────────────────────────

  async create(dto: CreateInquiryDto, userId?: string) {
    if (!dto.propertySlug && !dto.rentListingId) {
      throw new BadRequestException('Either propertySlug or rentListingId is required');
    }

    let propertyId: string | undefined;
    if (dto.propertySlug) {
      const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
      if (!property) throw new NotFoundException('Property not found');
      propertyId = property.id;
    }

    if (dto.rentListingId) {
      const listing = await this.prisma.rentListing.findUnique({ where: { id: dto.rentListingId } });
      if (!listing) throw new NotFoundException('Rent listing not found');
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

  // ─── Developer: list inquiries for own properties ─────────────────────────

  async findForDeveloper(userId: string, pagination: PaginationDto, status?: InquiryStatus) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

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

  // ─── User: my own inquiries ───────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto) {
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

  // ─── Get single inquiry ───────────────────────────────────────────────────

  async findOne(id: string, requesterId: string, requesterRole: UserRole) {
    const inquiry = await this.prisma.inquiry.findUnique({
      where: { id },
      include: {
        property: { include: { developer: true } },
        rentListing: { include: { developer: true } },
        replies: { orderBy: { createdAt: 'asc' }, include: { sender: { select: { id: true, firstName: true, lastName: true, avatarUrl: true, role: true } } } },
      },
    });
    if (!inquiry) throw new NotFoundException('Inquiry not found');

    const isOwner = inquiry.userId === requesterId;
    const isDeveloperOfProperty = inquiry.property?.developer.userId === requesterId;
    const isDeveloperOfListing = inquiry.rentListing?.developer.userId === requesterId;
    const isAdmin = requesterRole === UserRole.ADMIN;

    if (!isOwner && !isDeveloperOfProperty && !isDeveloperOfListing && !isAdmin) {
      throw new ForbiddenException('Access denied');
    }

    return inquiry;
  }

  // ─── Reply ────────────────────────────────────────────────────────────────

  async reply(id: string, senderId: string, senderRole: UserRole, dto: ReplyInquiryDto) {
    await this.findOne(id, senderId, senderRole);

    const [reply] = await this.prisma.$transaction([
      this.prisma.inquiryReply.create({
        data: { inquiryId: id, senderId, message: dto.message },
        include: { sender: { select: { id: true, firstName: true, lastName: true, role: true } } },
      }),
      this.prisma.inquiry.update({
        where: { id },
        data: { status: InquiryStatus.REPLIED },
      }),
    ]);

    return reply;
  }

  // ─── Update status ────────────────────────────────────────────────────────

  async updateStatus(id: string, userId: string, userRole: UserRole, status: InquiryStatus) {
    await this.findOne(id, userId, userRole);
    return this.prisma.inquiry.update({ where: { id }, data: { status } });
  }

  // ─── Admin: all inquiries ─────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, status?: InquiryStatus) {
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
}
