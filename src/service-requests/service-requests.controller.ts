import { Body, Controller, Get, Param, Post, Res } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Response } from 'express';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { ChangeRequestDto, CreateServiceRequestDto } from './dto/service-requests.dto.js';
import { ServiceRequestsService } from './service-requests.service.js';

/** Any signed-in user — developer, agent, investor, buyer or tenant — can request custom production. */
@ApiTags('Service requests')
@ApiBearerAuth()
@Controller('service-requests')
export class ServiceRequestsController {
  constructor(private readonly requests: ServiceRequestsService) {}

  @Post()
  @ApiOperation({ summary: 'Send a custom production request for a quote' })
  create(@CurrentUser() user: { id: string }, @Body() dto: CreateServiceRequestDto) {
    return this.requests.create(user.id, dto);
  }

  @Get('mine')
  mine(@CurrentUser() user: { id: string }) { return this.requests.mine(user.id); }

  @Get(':id')
  one(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.requests.getMine(id, user.id); }

  @Get(':id/quote.pdf')
  @ApiOperation({ summary: 'Download the current quote as a PDF' })
  async quotePdf(@Param('id') id: string, @CurrentUser() user: { id: string }, @Res() res: Response) {
    const { filename, pdf } = await this.requests.quotePdf(id, user.id);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(pdf);
  }

  @Post(':id/accept')
  @ApiOperation({ summary: 'Accept the quote: issues the invoice (card or M-Pesa)' })
  accept(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.requests.accept(id, user.id); }

  @Post(':id/request-changes')
  requestChanges(@Param('id') id: string, @CurrentUser() user: { id: string }, @Body() dto: ChangeRequestDto) {
    return this.requests.requestChanges(id, user.id, dto.message);
  }

  @Post(':id/cancel')
  cancel(@Param('id') id: string, @CurrentUser() user: { id: string }) { return this.requests.cancel(id, user.id); }
}
