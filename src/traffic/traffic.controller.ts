import { Body, Controller, Get, Param, Post, Query, Req } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Request } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { TrafficService, type HitDto } from './traffic.service.js';

@ApiTags('Traffic')
@Controller('traffic')
export class TrafficController {
  constructor(private readonly service: TrafficService) {}

  @Public()
  @Post('hit')
  @ApiOperation({ summary: 'Public: record a page view (signed in or not)' })
  hit(@Body() dto: HitDto, @Req() req: Request) {
    return this.service.recordHit(dto, { headers: req.headers, remoteIp: req.socket.remoteAddress });
  }

  @Get('properties/:slug')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Owner: visitors to one development across every address it is served on' })
  propertyTraffic(
    @Param('slug') slug: string,
    @Query('days') days: string | undefined,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.propertyTraffic(slug, user.id, user.role, Number(days) || 30);
  }

  @Public()
  @Post('hit/:id/duration')
  @ApiOperation({ summary: 'Public: time spent on a page, sent when leaving it' })
  duration(@Param('id') id: string, @Body() body: { visitorId: string; durationMs: number }) {
    return this.service.recordDuration(id, body?.visitorId, body?.durationMs);
  }
}

@ApiTags('Admin · Traffic')
@ApiBearerAuth()
@Controller('admin/traffic')
@Roles(UserRole.ADMIN)
export class AdminTrafficController {
  constructor(private readonly service: TrafficService) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin: totals, trend, pages, sources, locations and devices' })
  overview(@Query('days') days?: string) {
    return this.service.overview(Number(days) || 7);
  }

  @Get('live')
  @ApiOperation({ summary: 'Admin: visitors active in the last five minutes' })
  live() {
    return this.service.live();
  }

  @Get('visits')
  @ApiOperation({ summary: 'Admin: raw visit feed with filters' })
  visits(
    @Query('days') days?: string,
    @Query('page') page?: string,
    @Query('limit') limit?: string,
    @Query('audience') audience?: 'signed' | 'anonymous',
    @Query('country') country?: string,
    @Query('deviceType') deviceType?: string,
    @Query('path') path?: string,
  ) {
    return this.service.visits({
      days: Number(days), page: Number(page), limit: Number(limit), audience, country, deviceType, path,
    });
  }

  @Get('visitors/:visitorId')
  @ApiOperation({ summary: 'Admin: one visitor’s full page trail' })
  visitor(@Param('visitorId') visitorId: string) {
    return this.service.visitor(visitorId);
  }
}
