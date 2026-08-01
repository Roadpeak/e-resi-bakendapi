import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { AnalyticsEventType, Prisma, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AnalyticsService } from './analytics.service.js';

@ApiTags('Analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly service: AnalyticsService) {}

  @Public()
  @Post('track')
  @ApiOperation({ summary: 'Track an analytics event (public)' })
  track(
    @Body() dto: {
      type: AnalyticsEventType;
      propertyId?: string;
      sessionId?: string;
      source?: string;
      metadata?: Prisma.InputJsonValue;
    },
    @Query('userId') userId?: string,
  ) {
    return this.service.track(dto, userId);
  }

  @Get('properties/:slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: get analytics for a property' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  propertyStats(
    @Param('slug') slug: string,
    @Query('days') days?: string,
  ) {
    return this.service.propertyStats(slug, days ? parseInt(days, 10) : 30);
  }

  @Get('developer/overview')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: get own dashboard overview stats' })
  developerStats(@CurrentUser() user: { id: string }) {
    return this.service.developerStats(user.id);
  }

  @Get('developer/engagement')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: daily engagement series + traffic sources' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  developerEngagement(
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    return this.service.developerEngagement(user.id, days ? Number.parseInt(days, 10) : 7);
  }

  @Get('admin/platform')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: get platform-wide stats' })
  platformStats() {
    return this.service.platformStats();
  }
}
