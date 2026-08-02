import { Body, Controller, Delete, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PropertyStatus, UserRole } from '@prisma/client';
import { IsBoolean, IsEnum, IsIn, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminPropertiesService } from './admin-properties.service.js';
import { AuditService } from './audit.service.js';

/** Extends PaginationDto — forbidNonWhitelisted rejects undeclared params. */
class ListPropertiesDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsOptional()
  @IsEnum(PropertyStatus)
  status?: PropertyStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  developerId?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  q?: string;
}

class ReviewDto {
  @ApiPropertyOptional({ enum: ['APPROVE', 'REJECT'] })
  @IsIn(['APPROVE', 'REJECT'])
  decision: 'APPROVE' | 'REJECT';

  @ApiPropertyOptional({ description: 'Shown to the developer when rejected' })
  @IsOptional()
  @IsString()
  @MaxLength(500)
  notes?: string;
}

class SetStatusDto {
  @ApiPropertyOptional({ enum: PropertyStatus })
  @IsEnum(PropertyStatus)
  status: PropertyStatus;
}

class FeatureDto {
  @ApiPropertyOptional()
  @IsBoolean()
  isFeatured: boolean;
}

class ReassignDto {
  @ApiPropertyOptional()
  @IsString()
  developerId: string;
}

@ApiTags('Admin · Properties')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/properties')
export class AdminPropertiesController {
  constructor(
    private readonly service: AdminPropertiesService,
    private readonly audit: AuditService,
  ) {}

  @Get()
  @ApiOperation({ summary: 'Admin: list every property across all developers' })
  list(@Query() query: ListPropertiesDto) {
    const { status, developerId, q, ...pagination } = query;
    return this.service.list(pagination as PaginationDto, { status, developerId, q });
  }

  @Patch(':slug/review')
  @ApiOperation({ summary: 'Admin: approve or reject a submitted listing' })
  async review(
    @Param('slug') slug: string,
    @Body() dto: ReviewDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.review(slug, dto.decision, actor.id, dto.notes);
    await this.audit.record({
      actorId: actor.id,
      action: dto.decision === 'APPROVE' ? 'property.approve' : 'property.reject',
      targetType: 'Property',
      targetId: before.id,
      summary: `${after.name}: ${before.status} → ${after.status}${dto.notes ? ` (${dto.notes})` : ''}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }

  @Patch(':slug/status')
  @ApiOperation({ summary: 'Admin: change a property status directly' })
  async setStatus(
    @Param('slug') slug: string,
    @Body() dto: SetStatusDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.setStatus(slug, dto.status);
    await this.audit.record({
      actorId: actor.id,
      action: 'property.status.change',
      targetType: 'Property',
      targetId: before.id,
      summary: `${after.name}: ${before.status} → ${after.status}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }

  @Delete(':slug')
  @ApiOperation({
    summary: 'Admin: permanently delete a property and its media, units and '
      + 'tours. Refused while rent listings, bookings or inquiries reference it.',
  })
  async remove(@Param('slug') slug: string, @CurrentUser() actor: { id: string }) {
    const property = await this.service.remove(slug);
    await this.audit.record({
      actorId: actor.id,
      action: 'property.delete',
      targetType: 'Property',
      targetId: property.id,
      summary: `Deleted ${property.name} (${property.city})`,
    });
    return { message: `${property.name} has been deleted` };
  }

  @Patch(':slug/feature')
  @ApiOperation({ summary: 'Admin: feature or unfeature a property' })
  async feature(
    @Param('slug') slug: string,
    @Body() dto: FeatureDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { after } = await this.service.setFeatured(slug, dto.isFeatured);
    await this.audit.record({
      actorId: actor.id,
      action: dto.isFeatured ? 'property.feature' : 'property.unfeature',
      targetType: 'Property',
      targetId: after.id,
      summary: `${after.name} ${dto.isFeatured ? 'featured' : 'unfeatured'}`,
    });
    return after;
  }

  @Patch(':slug/reassign')
  @ApiOperation({ summary: 'Admin: move a property to another developer' })
  async reassign(
    @Param('slug') slug: string,
    @Body() dto: ReassignDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.reassign(slug, dto.developerId);
    await this.audit.record({
      actorId: actor.id,
      action: 'property.reassign',
      targetType: 'Property',
      targetId: before.id,
      summary: `${after.name}: ${before.developer?.companyName} → ${after.developer?.companyName}`,
    });
    return after;
  }
}
