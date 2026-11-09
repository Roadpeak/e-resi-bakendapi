import { Body, Controller, Delete, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { MoveInventoryDto, UnitTypeDto, UnitTypeMediaDto, UpdateUnitTypeDto } from './dto/unit-type.dto.js';
import { UnitTypesService } from './unit-types.service.js';

type U = { id: string; role: UserRole };
const OWNERS = [UserRole.DEVELOPER, UserRole.AGENT, UserRole.ADMIN];

@ApiTags('Unit types')
@Controller('properties/:slug/unit-types')
export class UnitTypesController {
  constructor(private readonly service: UnitTypesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: the layouts a development sells, with what is left of each' })
  list(@Param('slug') slug: string) {
    return this.service.list(slug);
  }

  @Get('manage')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Owner: unit types with hand-kept counts, media and linked units' })
  listForOwner(@Param('slug') slug: string, @CurrentUser() user: U) {
    return this.service.listForOwner(slug, user.id, user.role);
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public: one unit type with its media, tours and units' })
  findOne(@Param('slug') slug: string, @Param('id') id: string) {
    return this.service.findOne(slug, id);
  }

  @Post()
  @Roles(...OWNERS)
  @ApiBearerAuth()
  create(@Param('slug') slug: string, @CurrentUser() user: U, @Body() dto: UnitTypeDto) {
    return this.service.create(slug, user.id, user.role, dto);
  }

  @Patch(':id')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  update(@Param('slug') slug: string, @Param('id') id: string, @CurrentUser() user: U, @Body() dto: UpdateUnitTypeDto) {
    return this.service.update(slug, id, user.id, user.role, dto);
  }

  @Post(':id/move')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Owner: move units between available, reserved and sold' })
  move(@Param('slug') slug: string, @Param('id') id: string, @CurrentUser() user: U, @Body() dto: MoveInventoryDto) {
    return this.service.move(slug, id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  remove(@Param('slug') slug: string, @Param('id') id: string, @CurrentUser() user: U) {
    return this.service.remove(slug, id, user.id, user.role);
  }

  @Post(':id/media')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  addMedia(@Param('slug') slug: string, @Param('id') id: string, @CurrentUser() user: U, @Body() dto: UnitTypeMediaDto) {
    return this.service.addMedia(slug, id, user.id, user.role, dto);
  }

  @Delete(':id/media/:mediaId')
  @Roles(...OWNERS)
  @ApiBearerAuth()
  removeMedia(
    @Param('slug') slug: string, @Param('id') id: string, @Param('mediaId') mediaId: string, @CurrentUser() user: U,
  ) {
    return this.service.removeMedia(slug, id, mediaId, user.id, user.role);
  }
}
