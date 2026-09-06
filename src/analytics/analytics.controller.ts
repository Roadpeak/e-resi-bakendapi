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
      agentId?: string;
      sessionId?: string;
      source?: string;
      metadata?: Prisma.InputJsonValue;
      /// Signed-in visitors report who they are, so a registered investor's
      /// browsing can surface as a lead. Same trust model as the query
      /// param this endpoint always had — analytics, not authentication.
      userId?: string;
    },
    @Query('userId') userId?: string,
  ) {
    return this.service.track(dto, dto.userId ?? userId);
  }

  @Get('properties/:slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: get analytics for a property' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  propertyStats(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('days') days?: string,
  ) {
    return this.service.miniSiteReport(
      slug, user.id, user.role, days ? parseInt(days, 10) : 30,
    );
  }

  @Get('viewers')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Signed-in customers browsing my properties (developer) or my referred visitors (agent)',
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  viewers(
    @CurrentUser() user: { id: string; role: UserRole },
    @Query('days') days?: string,
  ) {
    return this.service.interestedViewers(
      user.role === UserRole.AGENT ? { agentUserId: user.id } : { developerUserId: user.id },
      days ? parseInt(days, 10) : 30,
    );
  }

  @Post('viewers/capture')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'File an interested viewer as a lead (Inquiry or Deal by role)' })
  captureViewer(
    @CurrentUser() user: { id: string; role: UserRole },
    @Body() dto: { userId: string; propertyId: string },
  ) {
    return this.service.captureViewer(
      user.role === UserRole.AGENT ? { agentUserId: user.id } : { developerUserId: user.id },
      dto,
    );
  }

  @Get('referrals/developer')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: "Developer: each agent's link traffic and leads, per property",
  })
  @ApiQuery({ name: 'days', required: false, type: Number })
  developerReferrals(
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    return this.service.referralStats(
      { developerUserId: user.id },
      days ? parseInt(days, 10) : 90,
    );
  }

  @Get('referrals/agent')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: what my shared links delivered, per property' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  agentReferrals(
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    return this.service.referralStats(
      { agentUserId: user.id },
      days ? parseInt(days, 10) : 90,
    );
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
