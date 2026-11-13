import { Body, Controller, Get, HttpCode, Param, Post, Res } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { Public } from '../common/decorators/public.decorator.js';
import { AcceptInviteDto } from './dto/invites.dto.js';
import { InvitesService } from './invites.service.js';

@ApiTags('Partner invites')
@Controller('invites')
export class InvitesController {
  constructor(private readonly invites: InvitesService) {}

  @Public()
  @Get(':code/preview')
  @ApiOperation({ summary: 'Public: name and logo for a shared invite link\'s preview (does not count an open)' })
  preview(@Param('code') code: string) {
    return this.invites.preview(code);
  }

  @Public()
  @Get(':code')
  @ApiOperation({ summary: 'Public: the personalised welcome for an invite link (records the open)' })
  open(@Param('code') code: string) {
    return this.invites.open(code);
  }

  @Public()
  @Post(':code/accept')
  @HttpCode(200)
  @ApiOperation({ summary: 'Public: sign up through an invite — verified, approved and signed in at once' })
  accept(
    @Param('code') code: string,
    @Body() dto: AcceptInviteDto,
    @Res({ passthrough: true }) res: Response,
  ) {
    return this.invites.accept(code, dto, res);
  }
}
