import { Body, Controller, Get, Param, Patch, Post, Query, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import type { Response } from 'express';
import { AuditService } from '../admin/audit.service.js';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AdminListQueryDto, AdminStatusDto, SendQuoteDto } from './dto/service-requests.dto.js';
import { ServiceRequestsService } from './service-requests.service.js';

@ApiTags('Admin — service requests')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/service-requests')
export class ServiceRequestsAdminController {
  constructor(private readonly requests: ServiceRequestsService, private readonly audit: AuditService) {}

  @Get()
  list(@Query() q: AdminListQueryDto) { return this.requests.adminList(q.status, q.q); }

  @Get(':id')
  one(@Param('id') id: string) { return this.requests.adminGet(id); }

  @Get(':id/quote.pdf')
  async quotePdf(@Param('id') id: string, @Res() res: Response) {
    const { filename, pdf } = await this.requests.quotePdf(id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post(':id/quote')
  async quote(@Param('id') id: string, @Body() dto: SendQuoteDto, @CurrentUser() admin: { id: string }) {
    const r = await this.requests.sendQuote(id, admin.id, dto);
    await this.audit.record({
      actorId: admin.id, action: 'service_request.quote', targetType: 'ServiceRequest', targetId: id,
      summary: `${r.quoteNumber}: ${r.quoteCurrency} ${r.quoteTotal}`,
    });
    return r;
  }

  @Patch(':id/status')
  async status(@Param('id') id: string, @Body() dto: AdminStatusDto, @CurrentUser() admin: { id: string }) {
    const r = await this.requests.adminSetStatus(id, dto.status, dto.note);
    await this.audit.record({
      actorId: admin.id, action: `service_request.${dto.status.toLowerCase()}`, targetType: 'ServiceRequest', targetId: id, summary: dto.note,
    });
    return r;
  }
}
