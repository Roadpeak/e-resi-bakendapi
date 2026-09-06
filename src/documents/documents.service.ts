import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PlatformEventsService } from '../notifications/platform-events.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateDocumentDto } from './dto/create-document.dto.js';

@Injectable()
export class DocumentsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly events: PlatformEventsService,
  ) {}

  // ─── Upload document record ───────────────────────────────────────────────

  /**
   * One create endpoint, three shapes:
   * - propertyId → the developer's document library for a development
   * - reservationId → a purchase document, shared between developer and buyer
   * - parentId → the buyer's signed copy of a document that asked for one
   */
  async create(userId: string, dto: CreateDocumentDto) {
    if (dto.parentId) return this.createSignedCopy(userId, dto);

    if (dto.propertyId) {
      const property = await this.prisma.property.findUnique({
        where: { id: dto.propertyId },
        select: { developer: { select: { userId: true } } },
      });
      if (!property) throw new NotFoundException('Property not found');
      if (property.developer.userId !== userId) {
        throw new ForbiddenException('You do not own this property');
      }
    }

    let notifyBuyer: { userId: string; unitName: string } | null = null;
    if (dto.reservationId) {
      const reservation = await this.prisma.reservation.findUnique({
        where: { id: dto.reservationId },
        include: { unit: { include: { property: { include: { developer: true } } } } },
      });
      if (!reservation) throw new NotFoundException('Reservation not found');

      const isOwner = reservation.userId === userId;
      const isDeveloper = reservation.unit.property.developer.userId === userId;
      if (!isOwner && !isDeveloper) throw new ForbiddenException('Access denied to this reservation');
      // The developer sharing into a purchase is what the buyer must hear
      // about; a buyer adding their own paperwork is not news to themselves.
      if (isDeveloper && !isOwner) {
        notifyBuyer = { userId: reservation.userId, unitName: reservation.unit.name };
      }
    }

    const doc = await this.prisma.document.create({
      data: {
        userId,
        name: dto.name,
        url: dto.url,
        type: dto.type,
        sizeBytes: dto.sizeBytes,
        reservationId: dto.reservationId,
        propertyId: dto.propertyId,
        requiresSignature: dto.requiresSignature ?? false,
      },
    });

    if (notifyBuyer) {
      await this.events.documentShared(
        notifyBuyer.userId,
        doc.name,
        notifyBuyer.unitName,
        doc.requiresSignature,
        doc.id,
      );
    }

    return doc;
  }

  /**
   * The buyer's half of the signature loop: download, sign, upload the copy
   * against the original. Only the reservation's buyer can answer, only
   * documents that asked for a signature accept one, and the developer is
   * told the moment it lands.
   */
  private async createSignedCopy(userId: string, dto: CreateDocumentDto) {
    const parent = await this.prisma.document.findUnique({
      where: { id: dto.parentId },
      include: {
        reservation: {
          include: { unit: { include: { property: { include: { developer: true } } } } },
        },
      },
    });
    if (!parent || !parent.reservation) throw new NotFoundException('Document not found');
    if (!parent.requiresSignature) {
      throw new BadRequestException('This document does not ask for a signature');
    }
    if (parent.reservation.userId !== userId) {
      throw new ForbiddenException('Only the buyer can upload the signed copy');
    }

    const doc = await this.prisma.document.create({
      data: {
        userId,
        name: dto.name,
        url: dto.url,
        type: dto.type,
        sizeBytes: dto.sizeBytes,
        parentId: parent.id,
        reservationId: parent.reservationId,
      },
    });

    await this.events.documentSigned(
      parent.reservation.unit.property.developer.userId,
      parent.name,
      parent.reservation.unit.name,
      doc.id,
    );

    return doc;
  }

  // ─── Property document library ────────────────────────────────────────────

  /** The developer's per-property library. Own properties only. */
  async findForProperty(propertyId: string, userId: string) {
    const property = await this.prisma.property.findUnique({
      where: { id: propertyId },
      select: { developer: { select: { userId: true } } },
    });
    if (!property) throw new NotFoundException('Property not found');
    if (property.developer.userId !== userId) {
      throw new ForbiddenException('You do not own this property');
    }

    return this.prisma.document.findMany({
      where: { propertyId },
      orderBy: { createdAt: 'desc' },
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
      where: { reservationId, parentId: null },
      orderBy: { createdAt: 'desc' },
      include: { signedVersions: true },
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
