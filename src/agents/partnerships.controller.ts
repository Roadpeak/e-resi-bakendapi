import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PartnershipStatus, UserRole } from '@prisma/client';
import { IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUrl, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { PartnershipsService } from './partnerships.service.js';

class RequestPartnershipDto {
  @IsOptional() @IsString() agentId?: string;
  @IsOptional() @IsString() developerId?: string;
  @IsOptional() @IsString() @MaxLength(1000) message?: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
}

class AssignPropertyDto {
  @IsString() propertyId: string;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
  @IsOptional() @IsString() @MaxLength(1000) notes?: string;
}

class AddDocumentDto {
  @IsString() @MaxLength(200) name: string;
  @IsUrl() url: string;
  @IsOptional() @IsString() @MaxLength(80) kind?: string;
  @IsOptional() @IsInt() @Min(0) sizeBytes?: number;
}

/** Declared on the DTO because unknown query keys are rejected outright. */
class ListPartnershipsDto extends PaginationDto {
  @IsOptional()
  @IsEnum(PartnershipStatus)
  status?: PartnershipStatus;
}

@ApiTags('Agent Partnerships')
@ApiBearerAuth()
@Controller('partnerships')
export class PartnershipsController {
  constructor(private readonly partnerships: PartnershipsService) {}

  // Literal routes stay above ':id' — the wildcard would otherwise swallow
  // "my-assignments" and try to load it as a partnership.

  @Get('my-assignments')
  @Roles(UserRole.AGENT)
  @ApiOperation({ summary: 'Agent: properties assigned to me, with commission' })
  myAssignments(@CurrentUser() user: { id: string }, @Query() pagination: PaginationDto) {
    return this.partnerships.myAssignedProperties(user.id, pagination);
  }

  @Get()
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'My partnerships, from whichever side I am on' })
  @ApiQuery({ name: 'status', enum: PartnershipStatus, required: false })
  list(@CurrentUser() user: { id: string }, @Query() query: ListPartnershipsDto) {
    return this.partnerships.listMine(user.id, query, query.status);
  }

  @Post()
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Propose a partnership — either side may ask' })
  request(@CurrentUser() user: { id: string }, @Body() dto: RequestPartnershipDto) {
    return this.partnerships.request(
      user.id,
      { agentId: dto.agentId, developerId: dto.developerId },
      dto.message,
      dto.commissionPercent,
    );
  }

  @Get(':id')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'One partnership with its assignments and documents' })
  getOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.partnerships.getOne(id, user.id);
  }

  @Get(':id/leads')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Leads this agent introduced under this partnership' })
  @ApiQuery({ name: 'days', required: false, type: Number })
  leads(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Query('days') days?: string,
  ) {
    return this.partnerships.leads(id, user.id, days ? parseInt(days, 10) : 90);
  }

  @Patch(':id/respond')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Accept or decline — only the side that was asked' })
  respond(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body('accept') accept: boolean,
  ) {
    return this.partnerships.respond(id, user.id, accept);
  }

  @Patch(':id/end')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'End an active partnership and close its assignments' })
  end(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.partnerships.end(id, user.id);
  }

  // ─── Assignments ──────────────────────────────────────────────────────────

  @Post(':id/properties')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: assign one of your properties to this agent' })
  assign(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AssignPropertyDto,
  ) {
    return this.partnerships.assignProperty(
      id, user.id, dto.propertyId, dto.commissionPercent, dto.notes,
    );
  }

  @Delete(':id/properties/:propertyId')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: end an assignment (kept for the record)' })
  unassign(
    @Param('id') id: string,
    @Param('propertyId') propertyId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.partnerships.unassignProperty(id, user.id, propertyId);
  }

  // ─── Agreement documents ──────────────────────────────────────────────────

  @Get(':id/documents')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Agreements on this partnership — both sides can read all' })
  listDocuments(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.partnerships.listDocuments(id, user.id);
  }

  @Post(':id/documents')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Attach a signed agreement — either side may upload' })
  addDocument(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddDocumentDto,
  ) {
    return this.partnerships.addDocument(id, user.id, dto);
  }

  @Delete(':id/documents/:documentId')
  @Roles(UserRole.DEVELOPER, UserRole.AGENT)
  @ApiOperation({ summary: 'Remove a document you uploaded' })
  removeDocument(
    @Param('id') id: string,
    @Param('documentId') documentId: string,
    @CurrentUser() user: { id: string },
  ) {
    return this.partnerships.removeDocument(id, user.id, documentId);
  }
}
