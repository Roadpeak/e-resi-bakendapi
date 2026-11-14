import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { OptionalJwtGuard } from '../auth/guards/optional-jwt.guard.js';
import { CommentDto, CreateReelDto, FeedQueryDto, UpdateReelDto, ViewReelDto } from './dto/reels.dto.js';
import { ReelsService } from './reels.service.js';

type U = { id: string; role: UserRole } | undefined;

@ApiTags('Reels')
@Controller('reels')
export class ReelsController {
  constructor(private readonly reels: ReelsService) {}

  // ── Owner (agents and developers; staff act as their employer) ──

  @Get('me/state')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Owner: whether reels are unlocked, the price, and any open unlock invoice' })
  state(@CurrentUser() user: { id: string }) { return this.reels.state(user.id); }

  @Post('me/unlock')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Owner: unlock reels (free at once, or issues a one-time invoice)' })
  unlock(@CurrentUser() user: { id: string }) { return this.reels.unlock(user.id); }

  @Get('me/linkable')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  linkable(@CurrentUser() user: { id: string }) { return this.reels.linkable(user.id); }

  @Get('me')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  mine(@CurrentUser() user: { id: string }) { return this.reels.mine(user.id); }

  @Post()
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateReelDto) { return this.reels.create(user.id, dto); }

  @Patch(':id')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  update(@CurrentUser() user: { id: string }, @Param('id') id: string, @Body() dto: UpdateReelDto) { return this.reels.update(user.id, id, dto); }

  @Delete(':id')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiBearerAuth()
  remove(@CurrentUser() user: { id: string }, @Param('id') id: string) { return this.reels.remove(user.id, id); }

  // ── Public ──

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get()
  @ApiOperation({ summary: 'Public: the ranked reels feed (personalised when signed in or with a visitor id)' })
  feed(@Query() q: FeedQueryDto, @CurrentUser() user: U) {
    return this.reels.feed(q, { userId: user?.id, visitorId: q.visitorId });
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: U) { return this.reels.one(id, { userId: user?.id }); }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Post(':id/view')
  view(@Param('id') id: string, @Body() dto: ViewReelDto, @CurrentUser() user: U) {
    return this.reels.view(id, { userId: user?.id, visitorId: dto.visitorId }, dto.watchedMs ?? 0);
  }

  @Public()
  @UseGuards(OptionalJwtGuard)
  @Get(':id/comments')
  comments(@Param('id') id: string, @CurrentUser() user: U) { return this.reels.comments(id, user?.id); }

  // ── Signed in ──

  @Post(':id/like')
  @ApiBearerAuth()
  like(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.reels.like(id, user.id, true); }

  @Delete(':id/like')
  @ApiBearerAuth()
  unlike(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.reels.like(id, user.id, false); }

  @Post(':id/comments')
  @ApiBearerAuth()
  comment(@Param('id') id: string, @CurrentUser() user: { id: string }, @Body() dto: CommentDto) { return this.reels.comment(id, user.id, dto); }

  @Delete('comments/:commentId')
  @ApiBearerAuth()
  deleteComment(@Param('commentId') commentId: string, @CurrentUser() user: { id: string; role: UserRole }) {
    return this.reels.deleteComment(commentId, user.id, user.role === UserRole.ADMIN);
  }
}
