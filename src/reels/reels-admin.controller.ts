import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from '../admin/audit.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminReelStatusDto, AdminReelsQueryDto } from './dto/reels.dto.js';
import { ReelsService } from './reels.service.js';

@ApiTags('Admin — reels')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/reels')
export class ReelsAdminController {
  constructor(private readonly reels: ReelsService, private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: AdminReelsQueryDto) { return this.reels.adminList(q.status, q.q, q.page ?? 1); }

  @Get(':id/comments')
  comments(@Param('id') id: string) { return this.reels.comments(id); }

  @Patch(':id')
  async setStatus(@Param('id') id: string, @Body() dto: AdminReelStatusDto, @CurrentUser() admin: { id: string }) {
    const r = await this.reels.adminSetStatus(id, dto.status, dto.reason);
    await this.audit.record({
      actorId: admin.id, action: dto.status === 'REMOVED' ? 'reel.remove' : 'reel.restore',
      targetType: 'Reel', targetId: id, summary: dto.reason ?? undefined,
    });
    return r;
  }

  @Delete('comments/:commentId')
  async deleteComment(@Param('commentId') commentId: string, @CurrentUser() admin: { id: string }) {
    const r = await this.reels.deleteComment(commentId, admin.id, true);
    await this.audit.record({ actorId: admin.id, action: 'reel.comment.delete', targetType: 'ReelComment', targetId: commentId });
    return r;
  }
}
