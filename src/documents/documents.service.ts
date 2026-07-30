import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';

@Injectable()
export class DocumentsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Upload document record ───────────────────────────────────────────────

  async create(userId: string, dto: CreateDocumentDto) {
    // Validate reservation ownership if reservationId provided
    if (dto.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: dto.reservationId },
        include: { unit: { include: { property: { include: { developer: true } } } } },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');

      const isOwner = reservation.userId === userId;
      const isDeveloper = reservation.unit.property.developer.userId === userId;
      if (!isOwner && !isDeveloper) throw new ForbiddenException('Access denied to this reservation');
    }

    return this.prisma.document.create({
      data: {
        userId,
        name: dto.name,
        url: dto.url,
        type: dto.type,
        sizeBytes: dto.sizeBytes,
        reservationId: dto.reservationId,
      },
    });
  }

  // ─── List user's own documents ────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          reservation: {
            select: {
              id: true,
              stage: true,
              unit: { select: { name: true, property: { select: { slug: true, name: true } } } },
            },
          },
        },
      }),
      this.prisma.document.count({ where: { userId } }),
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

  // ─── List documents for a reservation ────────────────────────────────────

  async findForReservation(reservationId: string, userId: string, userRole: UserRole) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id: reservationId },
      include: { unit: { include: { property: { include: { developer: true } } } } },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    const isOwner = reservation.userId === userId;
    const isDeveloper = reservation.unit.property.developer.userId === userId;
    const isAdmin = userRole === UserRole.ADMIN;
    if (!isOwner && !isDeveloper && !isAdmin) throw new ForbiddenException('Access denied');

    return this.prisma.document.findMany({
      where: { reservationId },
      orderBy: { createdAt: 'desc' },
    });
  }

  // ─── Delete a document ────────────────────────────────────────────────────

  async remove(id: string, userId: string, userRole: UserRole) {
    const doc = await this.prisma.document.findUnique({ where: { id } });
    if (!doc) throw new NotFoundException('Document not found');
    if (userRole !== UserRole.ADMIN && doc.userId !== userId) {
      throw new ForbiddenException('You do not own this document');
    }
    await this.prisma.document.delete({ where: { id } });
    return { message: 'Document deleted' };
  }

  // ─── Admin: search all documents ─────────────────────────────────────────

  async findAll(pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.document.findMany({
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
          reservation: { select: { id: true, stage: true } },
        },
      }),
      this.prisma.document.count(),
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
}
