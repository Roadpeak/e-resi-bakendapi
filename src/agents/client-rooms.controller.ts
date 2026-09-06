import { Body, Controller, Delete, Get, Param, Patch, Post, Put } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { Public } from '../common/decorators/public.decorator.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { ClientRoomsService } from './client-rooms.service.js';

class CreateRoomDto {
  @IsString() @MaxLength(120) title: string;
  @IsOptional() @IsString() @MaxLength(120) clientName?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  /// Ordered — the agent leads with their strongest pick.
  @IsOptional() @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) propertyIds?: string[];
}

class UpdateRoomDto {
  @IsOptional() @IsString() @MaxLength(120) title?: string;
  @IsOptional() @IsString() @MaxLength(120) clientName?: string;
  @IsOptional() @IsString() @MaxLength(1000) note?: string;
  @IsOptional() @IsBoolean() isActive?: boolean;
}

class SetItemsDto {
  @IsArray() @ArrayMaxSize(12) @IsString({ each: true }) propertyIds: string[];
}

class TrackDto {
  @IsString() propertyId: string;
}

@ApiTags('Client Rooms')
@Controller('client-rooms')
export class ClientRoomsController {
  constructor(private readonly rooms: ClientRoomsService) {}

  // ─── Public: the client's side of the link ────────────────────────────────
  // Above ':id' so "public" is never parsed as a room id.

  @Public()
  @Get('public/:token')
  @ApiOperation({ summary: 'Public: a client opens their room' })
  publicGet(@Param('token') token: string) {
    return this.rooms.publicGet(token);
  }

  @Public()
  @Post('public/:token/track')
  @ApiOperation({ summary: 'Public: the client opened one of the properties' })
  publicTrack(@Param('token') token: string, @Body() dto: TrackDto) {
    return this.rooms.publicTrack(token, dto.propertyId);
  }

  // ─── Agent: managing rooms ────────────────────────────────────────────────

  @Get()
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'My rooms, with open counts and last-viewed times' })
  listMine(@CurrentUser() user: { id: string }) {
    return this.rooms.listMine(user.id);
  }

  @Post()
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Create a room for a client' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateRoomDto) {
    return this.rooms.create(user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'One room, with per-property engagement' })
  getOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.rooms.getOne(id, user.id);
  }

  @Patch(':id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Rename, annotate, or switch a room on/off' })
  update(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateRoomDto,
  ) {
    return this.rooms.update(id, user.id, dto);
  }

  @Put(':id/items')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Replace the shortlist, in display order' })
  setItems(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetItemsDto,
  ) {
    return this.rooms.setItems(id, user.id, dto.propertyIds);
  }

  @Delete(':id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Delete a room' })
  remove(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.rooms.remove(id, user.id);
  }
}
