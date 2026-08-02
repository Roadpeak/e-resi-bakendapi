import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import {
  BookingStatus,
  InquiryStatus,
  RentListingStatus,
  UserRole,
} from '@prisma/client';
import { IsEnum, IsOptional } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AuditService } from './audit.service.js';

/** Extends PaginationDto — forbidNonWhitelisted rejects undeclared params. */
class ListRentalsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: RentListingStatus })
  @IsOptional()
  @IsEnum(RentListingStatus)
  status?: RentListingStatus;
}

class ListInquiriesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: InquiryStatus })
  @IsOptional()
  @IsEnum(InquiryStatus)
  status?: InquiryStatus;
}

class ListBookingsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: BookingStatus })
  @IsOptional()
  @IsEnum(BookingStatus)
  status?: BookingStatus;
}

class SetRentStatusDto {
  @ApiPropertyOptional({ enum: RentListingStatus })
  @IsEnum(RentListingStatus)
  status: RentListingStatus;
}

@ApiTags('Admin · Operations')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminOpsController {
  constructor(
    private readonly service: AdminOpsService,
    private readonly audit: AuditService,
  ) {}

  // ─── Rentals ──────────────────────────────────────────────────────────────

  @Get('rentals')
  @ApiOperation({ summary: 'Admin: every rent listing with its unit types' })
  rentals(@Query() query: ListRentalsDto) {
    const { status, ...pagination } = query;
    return this.service.rentListings(pagination as PaginationDto, status);
  }

  @Patch('rentals/:id/status')
  @ApiOperation({ summary: 'Admin: change a rent listing status (take down or restore)' })
  async setRentalStatus(
    @Param('id') id: string,
    @Body() dto: SetRentStatusDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.setRentListingStatus(id, dto.status);
    await this.audit.record({
      actorId: actor.id,
      action: 'rental.status.change',
      targetType: 'RentListing',
      targetId: id,
      summary: `${after.name}: ${before.status} → ${after.status}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }

  // ─── Leads ────────────────────────────────────────────────────────────────

  @Get('inquiries')
  @ApiOperation({ summary: 'Admin: inquiries across all developers' })
  inquiries(@Query() query: ListInquiriesDto) {
    const { status, ...pagination } = query;
    return this.service.inquiries(pagination as PaginationDto, status);
  }

  @Get('bookings')
  @ApiOperation({ summary: 'Admin: viewing bookings across all developers' })
  bookings(@Query() query: ListBookingsDto) {
    const { status, ...pagination } = query;
    return this.service.bookings(pagination as PaginationDto, status);
  }

  // ─── Chat moderation ──────────────────────────────────────────────────────

  @Get('conversations')
  @ApiOperation({ summary: 'Admin: all conversations between customers and developers' })
  conversations(@Query() pagination: PaginationDto) {
    return this.service.conversations(pagination);
  }

  @Get('conversations/:id/messages')
  @ApiOperation({ summary: 'Admin: read a conversation transcript' })
  async messages(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    const result = await this.service.messages(id);
    // Reading someone else's private messages is itself worth recording.
    await this.audit.record({
      actorId: actor.id,
      action: 'chat.transcript.read',
      targetType: 'Conversation',
      targetId: id,
      summary: `Read transcript (${result.messages.length} messages)`,
    });
    return result;
  }

  // ─── Analytics ────────────────────────────────────────────────────────────

  @Get('funnel')
  @ApiOperation({ summary: 'Admin: conversion funnel and most-viewed properties' })
  funnel(@Query('days') days?: string) {
    return this.service.funnel(days ? Number.parseInt(days, 10) : 30);
  }
}
