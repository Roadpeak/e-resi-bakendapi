import {
  Body, Controller, Delete, Get, Param, Patch, Post,
} from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { LinkMethodDto } from './dto/link-method.dto.js';
import { BillingService } from './billing.service.js';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(private readonly service: BillingService) {}

  @Get('summary')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Developer: billing summary — listing fees, production orders, payments' })
  summary(@CurrentUser() user: { id: string }) {
    return this.service.summary(user.id);
  }

  @Get('methods')
  @ApiOperation({ summary: 'List linked payment methods' })
  listMethods(@CurrentUser() user: { id: string }) {
    return this.service.listMethods(user.id);
  }

  @Post('methods')
  @ApiOperation({ summary: 'Link a card or PayPal payment method (display metadata only)' })
  linkMethod(@CurrentUser() user: { id: string }, @Body() dto: LinkMethodDto) {
    return this.service.linkMethod(user.id, dto);
  }

  @Patch('methods/:id/default')
  @ApiOperation({ summary: 'Make a linked method the default' })
  setDefault(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.setDefault(user.id, id);
  }

  @Delete('methods/:id')
  @ApiOperation({ summary: 'Remove a linked payment method' })
  removeMethod(@CurrentUser() user: { id: string }, @Param('id') id: string) {
    return this.service.removeMethod(user.id, id);
  }
}
