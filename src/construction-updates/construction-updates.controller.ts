import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { CreateConstructionUpdateDto } from './dto/create-construction-update.dto.js';
import { UpdateConstructionUpdateDto } from './dto/update-construction-update.dto.js';
import { ConstructionUpdatesService } from './construction-updates.service.js';

@ApiTags('Construction Updates')
@Controller('properties/:slug/construction-updates')
export class ConstructionUpdatesController {
  constructor(private readonly service: ConstructionUpdatesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: list construction progress updates for a property' })
  findAll(
    @Param('slug') slug: string,
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findAll(slug, pagination);
  }

  @Post()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: post a construction update' })
  create(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: CreateConstructionUpdateDto,
  ) {
    return this.service.create(slug, user.id, user.role, dto);
  }

  @Patch(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: edit a construction update' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdateConstructionUpdateDto,
  ) {
    return this.service.update(id, user.id, user.role, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: delete a construction update' })
  remove(
    @Param('id') id: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.remove(id, user.id, user.role);
  }
}
