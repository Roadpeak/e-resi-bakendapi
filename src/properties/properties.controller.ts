import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PropertyStatus, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreatePropertyDto } from './dto/create-property.dto.js';
import { QueryPropertiesDto } from './dto/query-properties.dto.js';
import { UpdateBrandingDto } from './dto/update-branding.dto.js';
import { UpdatePropertyDto } from './dto/update-property.dto.js';
import { NearbyPlacesService } from './nearby-places.service.js';
import { PropertiesService } from './properties.service.js';

@ApiTags('Properties')
@Controller('properties')
export class PropertiesController {
  constructor(
    private readonly propertiesService: PropertiesService,
    private readonly nearby: NearbyPlacesService,
  ) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Public: browse active properties' })
  findAll(@Query() query: QueryPropertiesDto) {
    return this.propertiesService.findAll(query);
  }

  /**
   * MUST stay above ':slug' — that is an unconstrained single-segment
   * wildcard and would otherwise match the literal word "nearby-suggestions"
   * and try to look it up as a property.
   */
  @Get('nearby-suggestions')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Developer: suggest nearby landmarks around a point, for the '
      + '"Nearby" list. Suggestions only — nothing is saved.',
  })
  @ApiQuery({ name: 'lat', required: true })
  @ApiQuery({ name: 'lng', required: true })
  @ApiQuery({ name: 'radius', required: false, description: 'Metres, default 3000' })
  nearbySuggestions(
    @Query('lat') lat: string,
    @Query('lng') lng: string,
    @Query('radius') radius?: string,
  ) {
    const latitude = Number.parseFloat(lat);
    const longitude = Number.parseFloat(lng);
    if (!Number.isFinite(latitude) || !Number.isFinite(longitude)
      || Math.abs(latitude) > 90 || Math.abs(longitude) > 180) {
      throw new BadRequestException('lat and lng must be valid coordinates');
    }
    const parsedRadius = Number.parseInt(radius ?? '', 10);
    // Capped: a wider box means more results to filter and more load on a
    // shared public endpoint, for landmarks too far away to be selling points.
    const metres = Number.isFinite(parsedRadius)
      ? Math.min(Math.max(parsedRadius, 250), 10_000)
      : 3000;
    return this.nearby.suggest(latitude, longitude, metres);
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

  @Patch(':slug/branding')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: update mini-site branding' })
  updateBranding(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: UpdateBrandingDto,
  ) {
    return this.propertiesService.updateBranding(slug, user.id, user.role, dto);
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

  /**
   * Separate from the archive route above rather than a flag on it: these are
   * different actions with different consequences, and an irreversible delete
   * should never be one query parameter away from a reversible hide.
   */
  @Delete(':slug/permanent')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: permanently delete a draft or archived property' })
  remove(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.propertiesService.remove(slug, user.id, user.role);
  }
}
