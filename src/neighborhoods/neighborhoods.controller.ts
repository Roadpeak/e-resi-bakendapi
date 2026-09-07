import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import {
  NeighborhoodsService,
  type UpsertNeighborhoodDto,
} from './neighborhoods.service.js';

@ApiTags('Neighborhoods')
@ApiBearerAuth()
@Controller('neighborhoods')
export class NeighborhoodsController {
  constructor(private readonly service: NeighborhoodsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: area guides with live listed-property counts' })
  list(@Query('city') city?: string) {
    return this.service.listPublic(city);
  }

  @Post()
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: create an area guide' })
  create(@Body() dto: UpsertNeighborhoodDto) {
    return this.service.create(dto);
  }

  @Patch(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: update an area guide' })
  update(@Param('id') id: string, @Body() dto: Partial<UpsertNeighborhoodDto>) {
    return this.service.update(id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.ADMIN)
  @ApiOperation({ summary: 'Admin: remove an area guide' })
  remove(@Param('id') id: string) {
    return this.service.remove(id);
  }

  @Public()
  @Get(':slug/amenities')
  @ApiOperation({ summary: 'Public: auto-detected amenities around the area (OpenStreetMap)' })
  amenities(@Param('slug') slug: string) {
    return this.service.getAmenities(slug);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Public: one area guide by slug' })
  get(@Param('slug') slug: string) {
    return this.service.getPublic(slug);
  }
}
