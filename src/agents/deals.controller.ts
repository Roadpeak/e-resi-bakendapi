import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { CommissionStatus, DealStage, UserRole } from '@prisma/client';
import {
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { DealsService } from './deals.service.js';

class CreateDealDto {
  @IsString() partnershipId: string;
  @IsString() propertyId: string;
  @IsOptional() @IsString() unitId?: string;
  @IsString() @MaxLength(120) clientName: string;
  @IsOptional() @IsString() @MaxLength(160) clientEmail?: string;
  @IsOptional() @IsString() @MaxLength(40) clientPhone?: string;
  @IsOptional() @IsString() @MaxLength(2000) notes?: string;
  /// Provenance — set when the deal grew out of an attributed lead.
  @IsOptional() @IsString() inquiryId?: string;
  @IsOptional() @IsString() bookingId?: string;
  @IsOptional() @IsString() reservationId?: string;
}

class UpdateStageDto {
  @IsEnum(DealStage) stage: DealStage;
  @IsOptional() @IsString() @MaxLength(500) lostReason?: string;
}

class SetCommissionDto {
  @IsOptional() @IsNumber() @Min(0) saleValue?: number;
  @IsOptional() @IsNumber() @Min(0) @Max(100) commissionPercent?: number;
}

class CommissionStatusDto {
  @IsEnum(CommissionStatus) status: CommissionStatus;
  @IsOptional() @IsString() @MaxLength(1000) reason?: string;
}

class SetUnitDto {
  /// Null clears the unit.
  @IsOptional() @IsString() unitId?: string | null;
}

class AddNoteDto {
  @IsString() @MaxLength(2000) note: string;
}

/** Declared on the DTO because unknown query keys are rejected outright. */
class ListDealsDto extends PaginationDto {
  @IsOptional() @IsEnum(DealStage) stage?: DealStage;
  @IsOptional() @IsEnum(CommissionStatus) commissionStatus?: CommissionStatus;
}

@ApiTags('Deals')
@ApiBearerAuth()
@Controller('deals')
export class DealsController {
  constructor(private readonly deals: DealsService) {}

  // Literal routes stay above ':id' — the wildcard would otherwise swallow
  // "summary" and try to load it as a deal.

  @Get('summary')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Pipeline and commission totals for my dashboard' })
  summary(@CurrentUser() user: { id: string }) {
    return this.deals.summary(user.id);
  }

  @Get()
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'My deals — agent sees theirs, developer sees theirs' })
  list(@CurrentUser() user: { id: string }, @Query() query: ListDealsDto) {
    return this.deals.listMine(user.id, query, {
      stage: query.stage,
      commissionStatus: query.commissionStatus,
    });
  }

  @Post()
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Open a deal on an active partnership' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateDealDto) {
    return this.deals.create(user.id, dto);
  }

  @Get(':id')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'One deal, with its full event history' })
  getOne(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.deals.getOne(id, user.id);
  }

  @Patch(':id/stage')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Move a deal along the pipeline' })
  updateStage(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: UpdateStageDto,
  ) {
    return this.deals.updateStage(id, user.id, dto.stage, dto.lostReason);
  }

  @Patch(':id/commission')
  @Roles(UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Developer: set the sale value and commission percent' })
  setCommission(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetCommissionDto,
  ) {
    return this.deals.setCommission(id, user.id, dto);
  }

  @Patch(':id/commission/status')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({
    summary: 'Move the commission: developer marks due/paid, agent disputes or withdraws',
  })
  commissionStatus(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: CommissionStatusDto,
  ) {
    return this.deals.updateCommissionStatus(id, user.id, dto.status, dto.reason);
  }

  @Patch(':id/unit')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Attach or clear the unit this deal is about (double-allocation guarded)' })
  setUnit(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: SetUnitDto,
  ) {
    return this.deals.setUnit(id, user.id, dto.unitId ?? null);
  }

  @Post(':id/notes')
  @Roles(UserRole.AGENT, UserRole.DEVELOPER)
  @ApiOperation({ summary: 'Append a note to the deal record' })
  addNote(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() dto: AddNoteDto,
  ) {
    return this.deals.addNote(id, user.id, dto.note);
  }
}
