import { Body, Controller, Get, Headers, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { Throttle } from '@nestjs/throttler';
import { SupportThrottlerGuard } from './support-throttler.guard.js';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard.js';
import {
  AdminSupportQueryDto, CreateSupportThreadDto, SupportMessageDto, SupportStatusDto,
} from './dto/support.dto.js';
import { SupportService, type SupportActor } from './support.service.js';

/** Visitors carry their thread's access token in this header. */
const TOKEN_HEADER = 'x-support-token';

@ApiTags('Support')
@Controller('support')
export class SupportController {
  constructor(private readonly service: SupportService) {}

  @Public()
  @UseGuards(SupportThrottlerGuard, OptionalJwtGuard)
  @Throttle({ default: { limit: 5, ttl: 60_000 } })
  @Post('threads')
  @ApiOperation({ summary: 'Write to the e-resi team (signed in or as a visitor)' })
  create(@Body() dto: CreateSupportThreadDto, @CurrentUser() user: SupportActor) {
    return this.service.create(dto, user ?? null);
  }

  @Get('threads/mine')
  @ApiBearerAuth()
  mine(@CurrentUser() user: NonNullable<SupportActor>) {
    return this.service.mine(user);
  }

  @Get('unread')
  @ApiBearerAuth()
  unread(@CurrentUser() user: NonNullable<SupportActor>) {
    return this.service.unreadCount(user);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get('threads/:id')
  get(
    @Param('id') id: string,
    @CurrentUser() user: SupportActor,
    @Headers(TOKEN_HEADER) token?: string,
  ) {
    return this.service.getForPerson(id, user ?? null, token);
  }

  @Public()
  @UseGuards(SupportThrottlerGuard, OptionalJwtGuard)
  @Throttle({ default: { limit: 20, ttl: 60_000 } })
  @Post('threads/:id/messages')
  reply(
    @Param('id') id: string,
    @Body() dto: SupportMessageDto,
    @CurrentUser() user: SupportActor,
    @Headers(TOKEN_HEADER) token?: string,
  ) {
    return this.service.replyAsPerson(id, dto.body, user ?? null, token);
  }
}

@ApiTags('Admin · Support')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/support')
export class AdminSupportController {
  constructor(private readonly service: SupportService) {}

  @Get()
  list(@Query() query: AdminSupportQueryDto) {
    return this.service.adminList(query);
  }

  @Get('unread')
  unread() {
    return this.service.adminUnreadCount();
  }

  @Get(':id')
  get(@Param('id') id: string) {
    return this.service.adminGet(id);
  }

  @Post(':id/messages')
  reply(@Param('id') id: string, @Body() dto: SupportMessageDto, @CurrentUser() user: NonNullable<SupportActor>) {
    return this.service.adminReply(id, dto.body, user);
  }

  @Patch(':id/status')
  status(@Param('id') id: string, @Body() dto: SupportStatusDto) {
    return this.service.adminSetStatus(id, dto.status);
  }
}
