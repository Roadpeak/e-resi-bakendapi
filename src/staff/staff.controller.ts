import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { STAFF_PAGES, StaffService } from './staff.service.js';

@ApiTags('Developer staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get('pages')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'The delegable dashboard pages' })
  pages() {
    return { pages: STAFF_PAGES };
  }

  @Get()
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: list your team' })
  list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }

  @Post('invite')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: invite a staff member by email with page access' })
  invite(
    @CurrentUser() user: { id: string },
    @Body() dto: { email: string; name?: string; pages: string[] },
  ) {
    return this.service.invite(user.id, dto);
  }

  @Public()
  @Get('invite/:token')
  @ApiOperation({ summary: 'Public: what an invite token grants (for the accept page)' })
  inviteDetails(@Param('token') token: string) {
    return this.service.inviteDetails(token);
  }

  @Public()
  @Post('invite/:token/accept')
  @ApiOperation({ summary: 'Public: accept an invite — set password, activate the account' })
  accept(
    @Param('token') token: string,
    @Body() dto: { password: string; firstName: string; lastName: string },
  ) {
    return this.service.acceptInvite(token, dto);
  }

  @Get(':id/activity')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: one staff member’s operations log and productivity' })
  activity(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.activity(user.id, id);
  }

  @Patch(':id')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: change a staff member’s page access' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: { pages?: string[]; name?: string },
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: revoke a staff member’s access' })
  revoke(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.revoke(user.id, id);
  }
}
