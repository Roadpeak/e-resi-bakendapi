import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UploadedFile, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { ApiBearerAuth, ApiConsumes, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AcceptInviteDto } from './dto/accept-invite.dto.js';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { pagesFor, StaffService } from './staff.service.js';

@ApiTags('Developer & agency staff')
@ApiBearerAuth()
@Controller('staff')
export class StaffController {
  constructor(private readonly service: StaffService) {}

  @Get('pages')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'The delegable portal pages for this employer' })
  pages(@CurrentUser() user: { role: UserRole }) {
    return { pages: pagesFor(user.role === UserRole.AGENT ? 'AGENT' : 'DEVELOPER') };
  }

  @Get()
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Developer: list your team' })
  list(@CurrentUser() user: { id: string }) {
    return this.service.list(user.id);
  }

  @Post('invite')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
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
  @Post('invite/:token/photo')
  @UseInterceptors(FileInterceptor('file', { limits: { fileSize: 5 * 1024 * 1024 } }))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({ summary: 'Public: upload the profile photo for an invite being accepted (max 5MB)' })
  invitePhoto(@Param('token') token: string, @UploadedFile() file: Express.Multer.File) {
    return this.service.uploadInvitePhoto(token, file);
  }

  @Public()
  @Post('invite/:token/accept')
  @ApiOperation({ summary: 'Public: accept an invite — photo, password, activate the account' })
  accept(
    @Param('token') token: string,
    @Body() dto: AcceptInviteDto,
  ) {
    return this.service.acceptInvite(token, dto);
  }

  @Get(':id/activity')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Developer: one staff member’s operations log and productivity' })
  activity(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.activity(user.id, id);
  }

  @Patch(':id')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Developer: change a staff member’s page access' })
  update(
    @CurrentUser() user: { id: string },
    @Param('id') id: string,
    @Body() dto: { pages?: string[]; name?: string },
  ) {
    return this.service.update(user.id, id, dto);
  }

  @Delete(':id')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Developer: revoke a staff member’s access' })
  revoke(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.revoke(user.id, id);
  }
}
