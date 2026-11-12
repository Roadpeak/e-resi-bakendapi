import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { AuditService } from '../admin/audit.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { CreateInviteDto, ListInvitesDto, UpdateInviteDto } from './dto/invites.dto.js';
import { InvitesService } from './invites.service.js';

@ApiTags('Admin — partner invites')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/invites')
export class InvitesAdminController {
  constructor(
    private readonly invites: InvitesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list personal invites' })
  list(@Query() query: ListInvitesDto) {
    return this.invites.list(query);
  }

  @Get('stats')
  @ApiOperation({ summary: 'Admin: invites created / opened / signed up, per referrer and kind' })
  stats() {
    return this.invites.stats();
  }

  @Get(':id')
  @ApiOperation({ summary: 'Admin: one invite' })
  get(@Param('id') id: string) {
    return this.invites.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Admin: create a personal invite link for an agent or developer' })
  async create(@CurrentUser() admin: { id: string }, @Body() dto: CreateInviteDto) {
    const inv = await this.invites.create(admin.id, dto);
    await this.audit.record({
      actorId: admin.id, action: 'invite.create', targetType: 'PartnerInvite', targetId: inv.id,
      summary: `Invited ${inv.name} (${inv.kind.toLowerCase()}) — shared by ${inv.referrer}`,
    });
    return inv;
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Admin: edit an invite, or revoke it (status: REVOKED)' })
  async update(@CurrentUser() admin: { id: string }, @Param('id') id: string, @Body() dto: UpdateInviteDto) {
    const inv = await this.invites.update(id, dto);
    await this.audit.record({
      actorId: admin.id, action: dto.status === 'REVOKED' ? 'invite.revoke' : 'invite.update',
      targetType: 'PartnerInvite', targetId: id, summary: `${inv.name}`, changes: dto as Record<string, unknown>,
    });
    return inv;
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Admin: delete an unused invite' })
  async remove(@CurrentUser() admin: { id: string }, @Param('id') id: string) {
    const r = await this.invites.remove(id);
    await this.audit.record({ actorId: admin.id, action: 'invite.delete', targetType: 'PartnerInvite', targetId: id });
    return r;
  }
}
