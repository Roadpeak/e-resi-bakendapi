import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminUsersService } from './admin-users.service.js';
import { AuditService } from './audit.service.js';
import {
  ListDevelopersDto,
  ListUsersDto,
  ReviewKybDto,
  SetRoleDto,
  SuspendUserDto,
} from './dto/admin-users.dto.js';

@ApiTags('Admin · People')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminUsersController {
  constructor(
    private readonly service: AdminUsersService,
    private readonly audit: AuditService,
  ) {}

  // ─── Users ────────────────────────────────────────────────────────────────

  @Get('users')
  @ApiOperation({ summary: 'Admin: list users with filters' })
  listUsers(@Query() query: ListUsersDto) {
    const { role, q, status, verified, ...pagination } = query;
    return this.service.list(pagination as PaginationDto, { role, q, status, verified });
  }

  @Get('users/:id')
  @ApiOperation({ summary: 'Admin: user detail with activity counts' })
  userDetail(@Param('id') id: string) {
    return this.service.detail(id);
  }

  @Delete('users/:id')
  @ApiOperation({
    summary: 'Admin: permanently delete a user. Refuses self-deletion, and '
      + 'developers who still have listings — suspend those instead.',
  })
  async deleteUser(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    const user = await this.service.deleteUser(id, actor.id);
    await this.audit.record({
      actorId: actor.id,
      action: 'user.delete',
      targetType: 'User',
      targetId: id,
      summary: `Deleted ${user.email} (${user.role})`,
    });
    return { message: `${user.email} has been deleted` };
  }

  @Patch('users/:id/suspend')
  @ApiOperation({ summary: 'Admin: suspend or reinstate a user' })
  async suspend(
    @Param('id') id: string,
    @Body() dto: SuspendUserDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.setSuspended(id, dto.suspended, dto.reason);
    await this.audit.record({
      actorId: actor.id,
      action: dto.suspended ? 'user.suspend' : 'user.reinstate',
      targetType: 'User',
      targetId: id,
      summary: `${after.email}${dto.suspended ? ` suspended${dto.reason ? `: ${dto.reason}` : ''}` : ' reinstated'}`,
      changes: this.audit.diff(
        { isActive: before.isActive },
        { isActive: after.isActive },
      ),
    });
    return after;
  }

  @Patch('users/:id/role')
  @ApiOperation({ summary: 'Admin: change a user role' })
  async setRole(
    @Param('id') id: string,
    @Body() dto: SetRoleDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.setRole(id, dto.role);
    await this.audit.record({
      actorId: actor.id,
      action: 'user.role.change',
      targetType: 'User',
      targetId: id,
      summary: `${after.email}: ${before.role} → ${after.role}`,
      changes: this.audit.diff({ role: before.role }, { role: after.role }),
    });
    return after;
  }

  @Patch('users/:id/verify')
  @ApiOperation({ summary: 'Admin: mark an email address verified' })
  async verify(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    const { after } = await this.service.verifyEmail(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'user.verify',
      targetType: 'User',
      targetId: id,
      summary: `${after.email} manually verified`,
    });
    return after;
  }

  // ─── Developers & KYB ─────────────────────────────────────────────────────

  @Get('developers')
  @ApiOperation({ summary: 'Admin: list developers with property counts and KYB status' })
  listDevelopers(@Query() query: ListDevelopersDto) {
    const { kybStatus, ...pagination } = query;
    return this.service.listDevelopers(pagination as PaginationDto, kybStatus);
  }

  @Get('developers/:profileId')
  @ApiOperation({
    summary: 'Admin: full developer profile — company, owner, onboarding '
      + 'submission, KYB documents and listings',
  })
  developerDetail(@Param('profileId') profileId: string) {
    return this.service.getDeveloper(profileId);
  }

  @Patch('developers/:profileId/kyb')
  @ApiOperation({ summary: 'Admin: approve or reject a developer KYB submission' })
  async reviewKyb(
    @Param('profileId') profileId: string,
    @Body() dto: ReviewKybDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.setKyb(profileId, dto.status, dto.notes);
    await this.audit.record({
      actorId: actor.id,
      action: 'developer.kyb.review',
      targetType: 'DeveloperProfile',
      targetId: profileId,
      summary: `${after.companyName}: ${before.kybStatus} → ${after.kybStatus}${dto.notes ? ` (${dto.notes})` : ''}`,
      changes: this.audit.diff({ kybStatus: before.kybStatus }, { kybStatus: after.kybStatus }),
    });
    return after;
  }
}
