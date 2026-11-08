import { Body, Controller, Get, Param, Patch, Post, Put, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { normaliseDomain, subdomainOf } from '../properties/custom-domain.js';
import { AgentSiteService } from './agent-site.service.js';
import { AgentTemplatesService } from './agent-templates.service.js';

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
  constructor(private readonly sites: AgentSiteService, private readonly templates: AgentTemplatesService) {}

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

  @Public()
  @Get(':agentId')
  @ApiOperation({ summary: 'Public: an agent website’s content' })
  site(@Param('agentId') agentId: string) {
    return this.sites.site(agentId);
  }
}
