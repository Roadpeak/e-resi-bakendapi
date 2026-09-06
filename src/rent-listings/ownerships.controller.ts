import { Body, Controller, Get, Param, Patch, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { FurnishingType, UserRole } from '@prisma/client';
import {
  IsBoolean,
  IsEmail,
  IsEnum,
  IsIn,
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { OwnershipsService } from './ownerships.service.js';

class RecordOwnershipDto {
  @IsString() unitId: string;
  @IsEmail() ownerEmail: string;
}

class CreateOwnerListingDto {
  @IsOptional() @IsString() @MaxLength(120) name?: string;
  @IsOptional() @IsString() @MaxLength(4000) description?: string;
  @IsNumber() @Min(1) pricePerMonth: number;
  @IsOptional() @IsEnum(FurnishingType) furnishing?: FurnishingType;
  @IsOptional() @IsString() availableFrom?: string;
  @IsOptional() @IsInt() @Min(1) minLeaseTerm?: number;
  /// Who runs it from day one. Engaging an agent comes after, by invitation.
  @IsIn(['OWNER', 'DEVELOPER']) manage: 'OWNER' | 'DEVELOPER';
}

class InviteAgentDto {
  @IsString() agentId: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
}

class RespondDto {
  @IsBoolean() accept: boolean;
}

@ApiTags('Unit Ownership')
@ApiBearerAuth()
@Controller('ownerships')
export class OwnershipsController {
  constructor(private readonly ownerships: OwnershipsService) {}

  @Get('mine')
  @ApiOperation({ summary: 'Investor: my owned units, with any rent listing each has' })
  mine(@CurrentUser() user: { id: string }) {
    return this.ownerships.mine(user.id);
  }

  @Post()
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: record a unit owner for an off-platform sale' })
  record(@CurrentUser() user: { id: string }, @Body() dto: RecordOwnershipDto) {
    return this.ownerships.record(user.id, dto);
  }

  @Post(':id/listing')
  @ApiOperation({ summary: 'Owner: list my unit for rent (photos are added afterwards)' })
  createListing(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CreateOwnerListingDto,
  ) {
    return this.ownerships.createListing(user.id, id, dto);
  }

  @Post('listings/:listingId/invite')
  @ApiOperation({ summary: 'Owner: invite an agent to find a tenant for this listing' })
  inviteAgent(
    @Param('listingId') listingId: string,
    @CurrentUser() user: { id: string },
    @Body() dto: InviteAgentDto,
  ) {
    return this.ownerships.inviteAgent(user.id, listingId, dto.agentId, dto.message);
  }

  @Get('engagements/mine')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: my letting invitations and the listings I manage' })
  agentEngagements(@CurrentUser() user: { id: string }) {
    return this.ownerships.agentEngagements(user.id);
  }

  @Patch('engagements/:id/respond')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: accept or decline a letting invitation' })
  respond(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: RespondDto,
  ) {
    return this.ownerships.respond(user.id, id, dto.accept);
  }

  @Patch('engagements/:id/end')
  @ApiOperation({ summary: 'Owner or agent: end an active letting engagement' })
  end(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.ownerships.endEngagement(user.id, id);
  }
}
