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
import { AgentKind, AgentSpecialty, KybStatus, UserRole } from '@prisma/client';
import { IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AgentsService } from './agents.service.js';
import { SubmitAgentKycDto } from './dto/submit-agent-kyc.dto.js';
import { UpdateAgentProfileDto } from './dto/update-agent-profile.dto.js';

/**
 * Validation runs over the whole query string with unknown keys forbidden, so
 * every filter has to be declared on the DTO rather than pulled out with a
 * bare @Query('x') — otherwise the request is rejected before it reaches the
 * handler.
 */
class AdminAgentQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(KybStatus)
  kybStatus?: KybStatus;

  @IsOptional()
  @IsEnum(AgentKind)
  kind?: AgentKind;
}

class PublicAgentQueryDto extends PaginationDto {
  @IsOptional()
  @IsEnum(AgentKind)
  kind?: AgentKind;

  @IsOptional()
  @IsEnum(AgentSpecialty)
  specialty?: AgentSpecialty;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  q?: string;
}

@ApiTags('Agents')
@Controller('agents')
export class AgentsController {
  constructor(private readonly agents: AgentsService) {}

  // ─── Agent: own profile ───────────────────────────────────────────────────
  //
  // Every literal route must stay above ':id' — that is an unconstrained
  // single-segment wildcard and will otherwise swallow "me", "admin" and any
  // literal added later, routing them into the public lookup instead.

  @Get('me')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: get own profile' })
  getMine(@CurrentUser() user: { id: string }) {
    return this.agents.getMine(user.id);
  }

  @Patch('me')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: update own profile and contact details' })
  updateMine(@CurrentUser() user: { id: string }, @Body() dto: UpdateAgentProfileDto) {
    return this.agents.updateMine(user.id, dto);
  }

  @Post('me/kyc')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Agent: submit verification documents. Company registration and '
      + 'address for companies; national ID and photo for individuals.',
  })
  submitKyc(@CurrentUser() user: { id: string }, @Body() dto: SubmitAgentKycDto) {
    return this.agents.submitKyc(user.id, dto);
  }

  // ─── Admin: verification queue ────────────────────────────────────────────

  @Get('admin/queue')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list agents, filterable by KYC status' })
  @ApiQuery({ name: 'kybStatus', enum: KybStatus, required: false })
  @ApiQuery({ name: 'kind', enum: AgentKind, required: false })
  listForAdmin(@Query() query: AdminAgentQueryDto) {
    return this.agents.listForAdmin(query, query.kybStatus, query.kind);
  }

  @Get('admin/:id')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: full agent record including KYC documents' })
  getForAdmin(@Param('id') id: string) {
    return this.agents.getForAdmin(id);
  }

  @Patch('admin/:id/review')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: approve or reject an agent’s KYC' })
  review(
    @Param('id') id: string,
    @CurrentUser() admin: { id: string },
    @Body() body: { status: 'APPROVED' | 'REJECTED'; rejectionReason?: string },
  ) {
    return this.agents.review(
      id,
      admin.id,
      body.status === 'APPROVED' ? KybStatus.APPROVED : KybStatus.REJECTED,
      body.rejectionReason,
    );
  }

  @Patch('admin/:id/listing')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: show or hide an agent in the public directory' })
  setListed(@Param('id') id: string, @Body('isListed') isListed: boolean) {
    return this.agents.setListed(id, isListed);
  }

  // ─── Reviews ──────────────────────────────────────────────────────────────
  //
  // Declared above ':id' — these are two-segment paths, but keeping every
  // agent route ahead of the bare wildcard keeps the ordering rule simple.

  @Public()
  @Get(':id/reviews')
  @ApiOperation({ summary: 'Public: reviews left on an agent' })
  listReviews(@Param('id') id: string, @Query() pagination: PaginationDto) {
    return this.agents.listReviews(id, pagination);
  }

  @Get(':id/reviews/eligibility')
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Whether the signed-in user may review this agent, and why not '
      + 'if they may not — so the UI can explain rather than just hide the form.',
  })
  reviewEligibility(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.agents.canReview(id, user.id);
  }

  @Post(':id/reviews')
  @Roles(UserRole.TENANT, UserRole.INVESTOR, UserRole.BUYER, UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Leave or update a review. One per person per agent — a second '
      + 'submission replaces the first.',
  })
  upsertReview(
    @Param('id') id: string,
    @CurrentUser() user: { id: string },
    @Body() body: { rating: number; comment?: string },
  ) {
    return this.agents.upsertReview(id, user.id, body.rating, body.comment);
  }

  @Delete(':id/reviews/mine')
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Remove your own review of this agent' })
  deleteOwnReview(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    return this.agents.deleteReview(id, user.id);
  }

  // ─── Public directory ─────────────────────────────────────────────────────

  @Public()
  @Get()
  @ApiOperation({
    summary: 'Public: verified, currently-listed agents, best-rated first',
  })
  @ApiQuery({ name: 'kind', enum: AgentKind, required: false })
  @ApiQuery({ name: 'specialty', enum: AgentSpecialty, required: false })
  @ApiQuery({ name: 'q', required: false })
  listPublic(@Query() query: PublicAgentQueryDto) {
    return this.agents.listPublic(query, {
      kind: query.kind,
      specialty: query.specialty,
      q: query.q,
    });
  }

  @Public()
  @Get(':id')
  @ApiOperation({ summary: 'Public: one agent’s profile' })
  getPublic(@Param('id') id: string) {
    return this.agents.getPublic(id);
  }
}
