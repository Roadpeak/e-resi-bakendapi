import { Body, Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AmenityType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateAmenityDto } from './dto/create-amenity.dto.js';
import { AmenitiesService } from './amenities.service.js';

@ApiTags('Amenities')
@Controller('properties/:slug/amenities')
export class AmenitiesController {
  constructor(private readonly service: AmenitiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: list nearby amenities for a property' })
  @ApiQuery({ name: 'type', enum: AmenityType, required: false })
  findAll(
    @Param('slug') slug: string,
    @Query('type') type?: AmenityType,
  ) {
    return this.service.findAll(slug, type);
  }

  @Post()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: add a single nearby amenity' })
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateAmenityDto,
  ) {
    return this.service.create(slug, user.id, user.role, dto);
  }

  @Post('bulk')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: bulk-add amenities (replaces workflow for initial setup)' })
  bulkCreate(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dtos: CreateAmenityDto[],
  ) {
    return this.service.bulkCreate(slug, user.id, user.role, dtos);
  }

  @Delete('all')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: remove all amenities for a property' })
  removeAll(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.removeAll(slug, user.id, user.role);
  }

  @Delete(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: remove a single amenity' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove(id, user.id, user.role);
  }
}
