import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ReservationStage, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateReservationDto } from './dto/create-reservation.dto.js';
import { ReservationsService } from './reservations.service.js';

@ApiTags('Reservations')
@ApiBearerAuth()
@Controller('reservations')
export class ReservationsController {
  constructor(private readonly service: ReservationsService) {}

  @Post()
  @ApiOperation({ summary: 'Reserve a unit (authenticated buyers/investors)' })
  create(
    @Body() dto: CreateReservationDto,
    @CurrentUser() user: { id: string },
  ) {
    return this.service.create(dto, user.id);
  }

  @Post('rent-units/:rentUnitId')
  @ApiOperation({ summary: 'Reserve one unit of a rent listing unit type' })
  reserveRentUnit(
    @Param('rentUnitId') rentUnitId: string,
    @CurrentUser() user: { id: string },
    @Body('expiresAt') expiresAt?: string,
    @Body('agentId') agentId?: string,
  ) {
    return this.service.createForRentUnit(rentUnitId, user.id, expiresAt, agentId);
  }

  @Get()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: list all reservations' })
  @ApiQuery({ name: 'stage', enum: ReservationStage, required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('stage') stage?: ReservationStage,
  ) {
    return this.service.findAll(pagination, stage);
  }

  @Get('mine')
  @ApiOperation({ summary: 'User: list own reservations' })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMine(user.id, pagination);
  }

  @Get('developer')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: list reservations on own properties' })
  findForDeveloper(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findForDeveloper(user.id, pagination);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get reservation detail' })
  findOne(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.findOne(id, user.id, user.role);
  }

  @Patch(':id/stage')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Developer/Admin: advance reservation through sale pipeline' })
  advanceStage(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('stage') stage: ReservationStage,
  ) {
    return this.service.advanceStage(id, user.id, user.role, stage);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Cancel reservation and release unit (owner or developer)' })
  cancel(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.cancel(id, user.id, user.role);
  }
}
