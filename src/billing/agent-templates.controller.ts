import { Body, Controller, Get, Param, Patch } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { SiteTemplateTier, UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsNumber, IsOptional, IsString, MaxLength, Min } from 'class-validator';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AgentTemplatesService } from './agent-templates.service.js';

class UpdateTemplateDto {
  @IsOptional() @IsEnum(SiteTemplateTier)
  tier?: SiteTemplateTier;

  @IsOptional() @IsNumber() @Min(0)
  unlockPrice?: number;

  @IsOptional() @IsBoolean()
  isActive?: boolean;

  @IsOptional() @IsString() @MaxLength(60)
  name?: string;

  @IsOptional() @IsString() @MaxLength(300)
  description?: string | null;
}

@ApiTags('Admin — agent templates')
@ApiBearerAuth()
@Controller('admin/agent-templates')
@Roles(UserRole.ADMIN)
export class AgentTemplatesAdminController {
  constructor(private readonly templates: AgentTemplatesService) {}

  @Get()
  @ApiOperation({ summary: 'Admin: agent-website templates with tier, unlock price and usage' })
  list() {
    return this.templates.adminList();
  }

  @Patch(':key')
  @ApiOperation({ summary: 'Admin: make a template free or premium, set its one-time price, or switch it off' })
  update(@Param('key') key: string, @Body() dto: UpdateTemplateDto) {
    return this.templates.adminUpdate(key, dto);
  }
}
