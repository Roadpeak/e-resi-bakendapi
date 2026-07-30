import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { BookingStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateBookingDto } from './dto/create-booking.dto.js';
import { BookingsService } from './bookings.service.js';

@ApiTags('Bookings')
@Controller('bookings')
export class BookingsController {
  constructor(private readonly service: BookingsService) {}

  @Public()
  @Post()
  @ApiOperation({ summary: 'Book a property viewing (public or authenticated)' })
  create(@Body() dto: CreateBookingDto, @Query('userId') userId?: string) {
    return this.service.create(dto, userId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list all bookings' })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('status') status?: BookingStatus,
  ) {
    return this.service.findAll(pagination, status);
  }

  @Get('mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Authenticated user: list own bookings' })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMine(user.id, pagination);
  }

  @Get('developer')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: list bookings for own properties' })
  @ApiQuery({ name: 'status', enum: BookingStatus, required: false })
  findForDeveloper(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
    @Query('status') status?: BookingStatus,
  ) {
    return this.service.findForDeveloper(user.id, pagination, status);
  }

  @Patch(':id/status')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: confirm, complete, or no-show a booking' })
  updateStatus(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('status') status: BookingStatus,
    @Body('meetingUrl') meetingUrl?: string,
  ) {
    return this.service.updateStatus(id, user.id, user.role, status, meetingUrl);
  }

  @Patch(':id/cancel')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Cancel a booking (owner, developer, or admin)' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.cancel(id, user.id, user.role);
  }
}
