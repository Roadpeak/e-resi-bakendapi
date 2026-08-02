import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';
import { AuditQueryDto } from './dto/audit-query.dto.js';

/** Every route here is ADMIN-only — the guard is applied at class level. */
@ApiTags('Admin')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin')
export class AdminController {
  constructor(
    private readonly service: AdminService,
    private readonly audit: AuditService,
  ) {}

  @Get('overview')
  @ApiOperation({ summary: 'Admin: platform counters and action queues' })
  overview() {
    return this.service.overview();
  }

  @Get('trends')
  @ApiOperation({ summary: 'Admin: daily revenue and signups' })
  @ApiQuery({ name: 'days', required: false, example: 30 })
  trends(@Query('days') days?: string) {
    return this.service.trends(days ? Number.parseInt(days, 10) : 30);
  }

  @Get('attention')
  @ApiOperation({ summary: 'Admin: items awaiting an administrator' })
  attention() {
    return this.service.attention();
  }

  @Get('audit')
  @ApiOperation({ summary: 'Admin: audit log of administrative actions' })
  auditLog(@Query() query: AuditQueryDto) {
    const { actorId, action, targetType, ...pagination } = query;
    return this.audit.list(pagination as PaginationDto, { actorId, action, targetType });
  }
}
