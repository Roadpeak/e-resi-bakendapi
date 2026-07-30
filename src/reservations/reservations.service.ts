import {
  BadRequestException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { ReservationStage, UnitStatus, UserRole } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import type { CreateReservationDto } from './dto/create-reservation.dto.js';

@Injectable()
export class ReservationsService {
  constructor(private readonly prisma: PrismaService) {}

  // ─── Create reservation ───────────────────────────────────────────────────

  async create(dto: CreateReservationDto, userId: string) {
    const unit = await this.prisma.unit.findUnique({ where: { id: dto.unitId } });
    if (!unit) throw new NotFoundException('Unit not found');
    if (unit.status !== UnitStatus.AVAILABLE) {
      throw new BadRequestException(`Unit is not available (status: ${unit.status})`);
    }

    // Check no active reservation already exists for this unit
    const existing = await this.prisma.reservation.findFirst({
      where: {
        unitId: dto.unitId,
        stage: { in: [ReservationStage.RESERVED, ReservationStage.AGREEMENT_SIGNED, ReservationStage.DEPOSIT_PAID] },
        expiresAt: { gt: new Date() },
      },
    });
    if (existing) throw new BadRequestException('Unit already has an active reservation');

    const expiresAt = dto.expiresAt
      ? new Date(dto.expiresAt)
      : new Date(Date.now() + 48 * 60 * 60 * 1000); // 48 hours default

    const [reservation] = await this.prisma.$transaction([
      this.prisma.reservation.create({
        data: { unitId: dto.unitId, userId, expiresAt },
        include: {
          unit: { include: { property: { select: { slug: true, name: true } } } },
        },
      }),
      this.prisma.unit.update({ where: { id: dto.unitId }, data: { status: UnitStatus.RESERVED } }),
    ]);

    return reservation;
  }

  // ─── User: my reservations ────────────────────────────────────────────────

  async findMine(userId: string, pagination: PaginationDto) {
    const [data, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where: { userId },
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          unit: { include: { property: { select: { slug: true, name: true, heroImageUrl: true } } } },
          documents: true,
          payments: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
      this.prisma.reservation.count({ where: { userId } }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Developer: reservations on own properties ────────────────────────────

  async findForDeveloper(userId: string, pagination: PaginationDto) {
    const developer = await this.prisma.developerProfile.findUnique({ where: { userId } });
    if (!developer) throw new ForbiddenException('Developer profile required');

    const unitIds = await this.prisma.unit
      .findMany({
        where: { property: { developerId: developer.id } },
        select: { id: true },
      })
      .then((us) => us.map((u) => u.id));

    const where = { unitId: { in: unitIds } };

    const [data, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          unit: { include: { property: { select: { slug: true, name: true } } } },
          user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
          payments: { orderBy: { createdAt: 'desc' }, take: 3 },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }

  // ─── Get single ───────────────────────────────────────────────────────────

  async findOne(id: string, userId: string, userRole: UserRole) {
    const reservation = await this.prisma.reservation.findUnique({
      where: { id },
      include: {
        unit: { include: { property: { include: { developer: true } } } },
        user: { select: { id: true, firstName: true, lastName: true, email: true, phone: true } },
        documents: true,
        payments: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!reservation) throw new NotFoundException('Reservation not found');

    const isOwner = reservation.userId === userId;
    const isDeveloper = reservation.unit.property.developer.userId === userId;
    const isAdmin = userRole === UserRole.ADMIN;

    if (!isOwner && !isDeveloper && !isAdmin) throw new ForbiddenException('Access denied');
    return reservation;
  }

  // ─── Advance stage ────────────────────────────────────────────────────────

  async advanceStage(id: string, userId: string, userRole: UserRole, stage: ReservationStage) {
    const reservation = await this.findOne(id, userId, userRole);

    // Only developer or admin can advance stage
    const isDeveloper = reservation.unit.property.developer.userId === userId;
    if (!isDeveloper && userRole !== UserRole.ADMIN) throw new ForbiddenException('Only the developer can advance reservation stage');

    const stageOrder: ReservationStage[] = [
      ReservationStage.RESERVED,
      ReservationStage.AGREEMENT_SIGNED,
      ReservationStage.DEPOSIT_PAID,
      ReservationStage.FINAL_PAYMENT,
      ReservationStage.TITLE_TRANSFERRED,
    ];

    const currentIndex = stageOrder.indexOf(reservation.stage);
    const targetIndex = stageOrder.indexOf(stage);
    if (targetIndex <= currentIndex) throw new BadRequestException('Cannot move to an earlier or same stage');

    // If fully paid or transferred, mark unit as SOLD
    const updatedUnit =
      stage === ReservationStage.FINAL_PAYMENT || stage === ReservationStage.TITLE_TRANSFERRED
        ? this.prisma.unit.update({ where: { id: reservation.unitId }, data: { status: UnitStatus.SOLD } })
        : null;

    const [updated] = await this.prisma.$transaction([
      this.prisma.reservation.update({ where: { id }, data: { stage } }),
      ...(updatedUnit ? [updatedUnit] : []),
    ]);

    return updated;
  }

  // ─── Cancel (release unit) ────────────────────────────────────────────────

  async cancel(id: string, userId: string, userRole: UserRole) {
    const reservation = await this.findOne(id, userId, userRole);

    if (reservation.stage === ReservationStage.TITLE_TRANSFERRED) {
      throw new BadRequestException('Cannot cancel a completed reservation');
    }

    await this.prisma.$transaction([
      this.prisma.reservation.delete({ where: { id } }),
      this.prisma.unit.update({ where: { id: reservation.unitId }, data: { status: UnitStatus.AVAILABLE } }),
    ]);

    return { message: 'Reservation cancelled and unit released' };
  }

  // ─── Admin: all reservations ──────────────────────────────────────────────

  async findAll(pagination: PaginationDto, stage?: ReservationStage) {
    const where = stage ? { stage } : {};
    const [data, total] = await Promise.all([
      this.prisma.reservation.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          unit: { include: { property: { select: { slug: true, name: true } } } },
          user: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.reservation.count({ where }),
    ]);

    return {
      data,
      meta: { total, page: pagination.page ?? 1, limit: pagination.limit ?? 20, totalPages: Math.ceil(total / (pagination.limit ?? 20)) },
    };
  }
}
