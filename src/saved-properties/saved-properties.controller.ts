import { Controller, Delete, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { SavedPropertiesService } from './saved-properties.service.js';

@ApiTags('Saved Properties')
@ApiBearerAuth()
@Controller('saved-properties')
export class SavedPropertiesController {
  constructor(private readonly service: SavedPropertiesService) {}

  @Get()
  @ApiOperation({ summary: 'List saved properties' })
  findMine(
    @CurrentUser() user: { id: string },
    @Query() pagination: PaginationDto,
  ) {
    return this.service.findMine(user.id, pagination);
  }

  @Post(':slug')
  @ApiOperation({ summary: 'Save a property' })
  save(
    @CurrentUser() user: { id: string },
    @Param('slug') slug: string,
  ) {
    return this.service.save(user.id, slug);
  }

  @Delete(':slug')
  @ApiOperation({ summary: 'Remove a property from saved list' })
  unsave(
    @CurrentUser() user: { id: string },
    @Param('slug') slug: string,
  ) {
    return this.service.unsave(user.id, slug);
  }

  @Get(':slug/status')
  @ApiOperation({ summary: 'Check if a property is saved' })
  isSaved(
    @CurrentUser() user: { id: string },
    @Param('slug') slug: string,
  ) {
    return this.service.isSaved(user.id, slug);
  }
}
