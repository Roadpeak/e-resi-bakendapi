import { Body, Controller, Delete, Get, Param, Patch, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Throttle } from '@nestjs/throttler';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { AgentSiteItemType, AgentSiteLeadType, LeadStatus, UserRole } from '@prisma/client';
import { IsArray, IsBoolean, IsEnum, IsIn, IsInt, IsObject, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { normaliseDomain, subdomainOf } from '../properties/custom-domain.js';
import { AgentSiteService } from './agent-site.service.js';
import { AgentTemplatesService } from './agent-templates.service.js';
import { AgentSiteContentService } from './agent-site-content.service.js';
import { AgentSiteLeadsService } from './agent-site-leads.service.js';
import { SupportThrottlerGuard } from '../support/support-throttler.guard.js';

class SubmitLeadDto {
  @IsEnum(AgentSiteLeadType)
  type: AgentSiteLeadType;

  @IsOptional() @IsString() @MaxLength(100)
  name?: string;

  @IsOptional() @IsString() @MaxLength(160)
  email?: string;

  @IsOptional() @IsString() @MaxLength(30)
  phone?: string;

  @IsOptional() @IsString() @MaxLength(2000)
  message?: string;

  @IsOptional() @IsString() @MaxLength(40)
  propertyId?: string;

  @IsOptional() @IsString() @MaxLength(40)
  slotAt?: string;

  @IsOptional() @IsObject()
  data?: Record<string, unknown>;

  @IsOptional() @IsString() @MaxLength(200)
  website?: string;
}

class FormsDto {
  @IsOptional() @IsBoolean() contact?: boolean;
  @IsOptional() @IsBoolean() valuation?: boolean;
  @IsOptional() @IsBoolean() viewing?: boolean;
  @IsOptional() @IsBoolean() newsletter?: boolean;
  @IsOptional() @IsBoolean() careers?: boolean;

  @IsOptional() @IsArray() @IsInt({ each: true }) @Min(0, { each: true }) @Max(6, { each: true })
  days?: number[];

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  start?: string;

  @IsOptional() @Matches(/^([01]\d|2[0-3]):[0-5]\d$/)
  end?: string;

  @IsOptional() @IsIn([30, 45, 60, 90, 120])
  slotMinutes?: number;

  @IsOptional() @IsArray() @IsIn(['IN_PERSON', 'VIDEO'], { each: true })
  modes?: ('IN_PERSON' | 'VIDEO')[];

  @IsOptional() @IsInt() @Min(0) @Max(168)
  noticeHours?: number;
}

class LeadStatusDto {
  @IsEnum(LeadStatus)
  status: LeadStatus;
}

class CreateItemDto {
  @IsEnum(AgentSiteItemType)
  type: AgentSiteItemType;

  @IsObject()
  data: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  isPublished?: boolean;
}

class UpdateItemDto {
  @IsOptional() @IsObject()
  data?: Record<string, unknown>;

  @IsOptional() @IsBoolean()
  isPublished?: boolean;
}

class ReorderDto {
  @IsEnum(AgentSiteItemType)
  type: AgentSiteItemType;

  @IsArray() @IsString({ each: true })
  ids: string[];
}

class LegalDto {
  @IsOptional() @IsString() @MaxLength(120)
  licenceNo?: string | null;

  @IsOptional() @IsString() @MaxLength(500)
  footerNote?: string | null;
}

class TemplateDto {
  @IsString() @MaxLength(40)
  key: string;
}

class SectionsDto {
  @IsArray()
  sections: { id: string; visible: boolean }[];
}

class HandleDto {
  @IsString() @MaxLength(63)
  handle: string;
}

class DomainDto {
  @IsOptional() @IsString() @MaxLength(253)
  domain?: string | null;
}

class BrandingDto {
  @IsOptional() @IsString() @MaxLength(160)
  tagline?: string | null;

  @IsOptional() @IsString() @MaxLength(7)
  accent?: string | null;

  @IsOptional() @IsString() @MaxLength(1000)
  heroUrl?: string | null;
}

type Actor = { id: string };

@ApiTags('Agent website')
@Controller('agent-site')
export class AgentSiteController {
  constructor(
    private readonly sites: AgentSiteService,
    private readonly templates: AgentTemplatesService,
    private readonly content: AgentSiteContentService,
    private readonly leads: AgentSiteLeadsService,
  ) {}

  @Public()
  @Get('prices')
  @ApiOperation({ summary: 'Public: agent website fees' })
  prices() {
    return this.sites.prices();
  }

  @Public()
  @Get('resolve/:host')
  @ApiOperation({ summary: 'Public: which agent website a host serves (used by the web proxy)' })
  async resolve(@Param('host') host: string) {
    const domain = normaliseDomain(host);
    const agentId = await this.sites.resolveHost(domain, subdomainOf(domain));
    if (!agentId) return { agentId: null };
    return { agentId, domain };
  }

  @Get('me')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  mine(@CurrentUser() user: Actor) {
    return this.sites.mine(user.id);
  }

  @Get('me/preview')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: preview the site, optionally in a template not yet unlocked' })
  preview(@CurrentUser() user: Actor, @Query('template') template?: string) {
    return this.sites.previewMine(user.id, template);
  }

  @Get('me/templates')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: template gallery with access, current template and section order' })
  myTemplates(@CurrentUser() user: Actor) {
    return this.templates.mine(user.id);
  }

  @Post('me/templates/:key/unlock')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: unlock a template (free → now, premium → one-time invoice)' })
  unlockTemplate(@CurrentUser() user: Actor, @Param('key') key: string) {
    return this.templates.unlock(user.id, key);
  }

  @Put('me/template')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: switch to an unlocked template' })
  selectTemplate(@CurrentUser() user: Actor, @Body() dto: TemplateDto) {
    return this.templates.select(user.id, dto.key);
  }

  @Put('me/sections')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: section order and visibility' })
  sections(@CurrentUser() user: Actor, @Body() dto: SectionsDto) {
    return this.templates.saveSections(user.id, dto.sections);
  }

  @Patch('me/branding')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  branding(@CurrentUser() user: Actor, @Body() dto: BrandingDto) {
    return this.sites.updateBranding(user.id, dto);
  }

  @Post('me/handle')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: claim <handle>.e-resi.com (activates now if free, else invoiced)' })
  handle(@CurrentUser() user: Actor, @Body() dto: HandleDto) {
    return this.sites.claimHandle(user.id, dto.handle);
  }

  @Put('me/domain')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: set or remove the website custom domain' })
  domain(@CurrentUser() user: Actor, @Body() dto: DomainDto) {
    return this.sites.setCustomDomain(user.id, dto.domain?.trim() || null);
  }

  @Post('me/domain/check')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  check(@CurrentUser() user: Actor) {
    return this.sites.refreshMine(user.id);
  }

  // ─── Content ────────────────────────────────────────────────────────────

  @Get('me/content')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: all website content (team, testimonials, past sales, FAQs, services, steps, posts, awards)' })
  myContent(@CurrentUser() user: Actor) {
    return this.content.mine(user.id);
  }

  @Post('me/content')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  addContent(@CurrentUser() user: Actor, @Body() dto: CreateItemDto) {
    return this.content.create(user.id, dto.type, dto.data, dto.isPublished ?? true);
  }

  @Put('me/content/order')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  reorderContent(@CurrentUser() user: Actor, @Body() dto: ReorderDto) {
    return this.content.reorder(user.id, dto.type, dto.ids);
  }

  @Patch('me/content/:id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  updateContent(@CurrentUser() user: Actor, @Param('id') id: string, @Body() dto: UpdateItemDto) {
    return this.content.update(user.id, id, dto);
  }

  @Delete('me/content/:id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  removeContent(@CurrentUser() user: Actor, @Param('id') id: string) {
    return this.content.remove(user.id, id);
  }

  @Patch('me/legal')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: licence number and footer note' })
  legal(@CurrentUser() user: Actor, @Body() dto: LegalDto) {
    return this.content.updateLegal(user.id, dto);
  }

  @Get('me/posts/:slug')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  myPost(@CurrentUser() user: Actor, @Param('slug') slug: string) {
    return this.content.postForOwner(user.id, slug);
  }

  // ─── Forms and website leads ────────────────────────────────────────────

  @Get('me/forms')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: which website forms are on, and viewing hours' })
  myForms(@CurrentUser() user: Actor) {
    return this.leads.forms(user.id);
  }

  @Put('me/forms')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  saveForms(@CurrentUser() user: Actor, @Body() dto: FormsDto) {
    return this.leads.saveForms(user.id, dto);
  }

  @Patch('me/leads/:id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Agent: move a website lead along (contacted, won…)' })
  leadStatus(@CurrentUser() user: Actor, @Param('id') id: string, @Body() dto: LeadStatusDto) {
    return this.leads.setStatus(user.id, id, dto.status);
  }

  @Delete('me/leads/:id')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  removeLead(@CurrentUser() user: Actor, @Param('id') id: string) {
    return this.leads.remove(user.id, id);
  }

  @Get('me/slots')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  mySlots(@CurrentUser() user: Actor) {
    return this.leads.slotsForOwner(user.id);
  }

  @Get('me/subscribers')
  @Roles(UserRole.AGENT)
  @ApiBearerAuth()
  subscribers(@CurrentUser() user: Actor) {
    return this.leads.subscribers(user.id);
  }

  @Public()
  @Get(':agentId/slots')
  @ApiOperation({ summary: 'Public: open viewing slots on an agent website (next two weeks)' })
  slots(@Param('agentId') agentId: string) {
    return this.leads.slots(agentId);
  }

  @Public()
  @Post(':agentId/leads')
  @UseGuards(SupportThrottlerGuard)
  @Throttle({ default: { limit: 6, ttl: 60_000 } })
  @ApiOperation({ summary: 'Public: send a form from an agent website' })
  submit(@Param('agentId') agentId: string, @Body() dto: SubmitLeadDto) {
    return this.leads.submit(agentId, dto);
  }

  @Public()
  @Get(':agentId/posts/:slug')
  @ApiOperation({ summary: 'Public: one journal post on an agent website' })
  post(@Param('agentId') agentId: string, @Param('slug') slug: string) {
    return this.content.post(agentId, slug);
  }

  @Public()
  @Get(':agentId')
  @ApiOperation({ summary: 'Public: an agent website’s content' })
  site(@Param('agentId') agentId: string) {
    return this.sites.site(agentId);
  }
}
