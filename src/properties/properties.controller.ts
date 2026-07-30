import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { PropertyStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { QueryPropertiesDto } from './dto/query-properties.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import { PropertiesService } from './properties.service.js';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(private readonly propertiesService: PropertiesService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: browse active properties' })
  findAll(@Query() query: QueryPropertiesDto) {
    return this.propertiesService.findAll(query);
  }

  @Public()
  @Get(':slug')
  @ApiOperation({ summary: 'Public: get property detail by slug' })
  findBySlug(@Param('slug') slug: string) {
    return this.propertiesService.findBySlug(slug);
  }

  @Post()
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: create a new property listing' })
  create(
    @CurrentUser() user: { id: string },
    @Body() dto: CreatePropertyDto,
  ) {
    return this.propertiesService.create(user.id, dto);
  }

  @Get('my/listings')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: list own properties' })
  findMyProperties(
    @CurrentUser() user: { id: string },
    @Query() query: QueryPropertiesDto,
  ) {
    return this.propertiesService.findMyProperties(user.id, query);
  }

  @Patch(':slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: update property' })
  update(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdatePropertyDto,
  ) {
    return this.propertiesService.update(slug, user.id, user.role, dto);
  }

  @Patch(':slug/status')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: publish, archive, or change property status' })
  setStatus(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body('status') status: PropertyStatus,
  ) {
    return this.propertiesService.setStatus(slug, user.id, user.role, status);
  }

  @Delete(':slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: archive (soft delete) a property' })
  archive(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.propertiesService.archive(slug, user.id, user.role);
  }
}
