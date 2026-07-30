import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { BookingStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateBookingDto } from './dto/create-booking.dto.js';

@Injectable()
export class BookingsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create (public or authenticated) ────────────────────────────────────

  async create(dto: CreateBookingDto, userId?: string) {
    const property = await this.prisma.property.findUnique({ where: { slug: dto.propertySlug } });
    if (!property) throw new NotFoundException('Property not found');

    return this.prisma.booking.create({
      data: {
        propertyId: property.id,
        name: dto.name,
        email: dto.email,
        phone: dto.phone,
        date: new Date(dto.date),
        time: dto.time,
        type: dto.type,
        message: dto.message,
        ...(userId && { userId }),
      },
      include: {
        property: { select: { slug: true, name: true, heroImageUrl: true } },
      },
    });
  }

  // ─── User: my bookings ────────────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { date: 'desc' },
        include: { property: { select: { slug: true, name: true, heroImageUrl: true, city: true } } },
      }),
      this.prisma.booking.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Developer: bookings for own properties ───────────────────────────────

  async findForDeveloper(userId: string, pagination: PaginationDto, status?: BookingStatus) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const propertyIds = await this.prisma.property
      .findMany({ where: { developerId: developer.id }, select: { id: true } })
      .then((ps) => ps.map((p) => p.id));

    const where = {
      propertyId: { in: propertyIds },
      ...(status && { status }),
    };

    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: [{ date: 'asc' }, { time: 'asc' }],
        include: { property: { select: { slug: true, name: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Developer: update booking status ────────────────────────────────────

  async updateStatus(id: string, userId: string, userRole: UserRole, status: BookingStatus, meetingUrl?: string) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');
    if (userRole !== UserRole.ADMIN && booking.property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    return this.prisma.booking.update({
      where: { id },
      data: {
        status,
        ...(meetingUrl && { meetingUrl }),
      },
    });
  }

  // ─── Admin: all bookings ──────────────────────────────────────────────────

  async findAll(pagination: PaginationDto, status?: BookingStatus) {
    const where = status ? { status } : {};
    const [data, total] = await Promise.all([
      this.prisma.booking.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: { property: { select: { slug: true, name: true } } },
      }),
      this.prisma.booking.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Cancel ───────────────────────────────────────────────────────────────

  async cancel(id: string, userId: string, userRole: UserRole) {
    const booking = await this.prisma.booking.findUnique({
      where: { id },
      include: { property: { include: { developer: true } } },
    });
    if (!booking) throw new NotFoundException('Booking not found');

    const isOwner = booking.userId === userId;
    const isDeveloper = booking.property.developer.userId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isDeveloper && !isAdmin) throw new ForbiddenException('Access denied');
    if (booking.status === BookingStatus.CANCELLED) throw new ForbiddenException('Booking already cancelled');

    return this.prisma.booking.update({ where: { id }, data: { status: BookingStatus.CANCELLED } });
  }
}
