import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { RentListingStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateRentListingDto } from './dto/create-rent-listing.dto.js';
import { CreateRentUnitDto } from './dto/create-rent-unit.dto.js';
import { UpdateRentListingDto } from './dto/update-rent-listing.dto.js';
import { RentListingsService } from './rent-listings.service.js';

@ApiTags('Rent Listings')
@Controller('rent-listings')
export class RentListingsController {
  constructor(private readonly service: RentListingsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: browse rent listings' })
  @ApiQuery({ name: 'city', required: false })
  @ApiQuery({ name: 'q', required: false })
  findAll(
    @Query() pagination: PaginationDto,
    @Query('city') city?: string,
    @Query('q') q?: string,
  ) {
    return this.service.findAll(pagination, city, q);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Public: get rent listing by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.service.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: create rent listing' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreateRentListingDto,
  ) {
    return this.service.create(user.id, dto);
  }

  @Get('my/listings')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: list own rent listings' })
  findMyListings(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMyListings(user.id, pagination);
  }

  @Patch(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: update rent listing' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdateRentListingDto,
  ) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Patch(':id/status')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: change rent listing status' })
  setStatus(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('status') status: RentListingStatus,
  ) {
    return this.service.setStatus(id, user.id, user.role, status);
  }

  @Post(':id/units')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: add unit type to rent listing' })
  addRentUnit(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateRentUnitDto,
  ) {
    return this.service.addRentUnit(id, user.id, user.role, dto);
  }

  @Delete(':id/units/:unitId')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: remove unit type from rent listing' })
  removeRentUnit(
    @Param('unitId') unitId: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeRentUnit(unitId, user.id, user.role);
  }
}
