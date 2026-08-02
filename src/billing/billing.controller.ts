import {
  Body, Controller, Delete, Get, Headers, Param, Patch, Post,
  Req, UnauthorizedException,
} from '@nestjs/common';
import type { RawBodyRequest } from '@nestjs/common';
import type { Request } from 'express';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { LinkCardDto, PayMpesaDto, PaypalConfirmDto } from './dto/link-method.dto.js';
import { BillingService } from './billing.service.js';
import { PaystackService } from './paystack.service.js';

@ApiTags('Billing')
@ApiBearerAuth()
@Controller('billing')
export class BillingController {
  constructor(
    private readonly service: BillingService,
    private readonly paystack: PaystackService,
  ) {}

  @Get('summary')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Developer: billing summary — listing fees, production orders, payments' })
  summary(@CurrentUser() user: { id: string }) {
    return this.service.summary(user.id);
  }

  // ─── Payment methods ────────────────────────────────────────────────────

  @Get('methods')
  @ApiOperation({ summary: 'List linked payment methods' })
  listMethods(@CurrentUser() user: { id: string }) {
    return this.service.listMethods(user.id);
  }

  @Post('methods/card')
  @ApiOperation({ summary: 'Link a card — verified with a $1 authorization that is reversed automatically' })
  linkCard(@CurrentUser() user: { id: string }, @Body() dto: LinkCardDto) {
    return this.service.linkCard(user.id, dto);
  }

  @Public()
  @Post('paystack/webhook')
  @ApiOperation({ summary: 'Paystack webhook — signature-verified, no auth' })
  async paystackWebhook(
    @Req() req: RawBodyRequest<Request>,
    @Headers('x-paystack-signature') signature: string,
  ) {
    const raw = req.rawBody;
    if (!raw || !this.paystack.verifyWebhook(raw, signature ?? '')) {
      throw new UnauthorizedException('Invalid webhook signature');
    }
    // Always 200 once the signature checks out. Paystack retries on anything
    // else, and a retry storm over an event we cannot process helps nobody.
    await this.service.handlePaystackEvent(req.body as { event: string; data: Record<string, unknown> });
    return { received: true };
  }

  @Post('methods/paystack/start')
  @ApiOperation({ summary: 'Start card linking — returns Paystack checkout URL (card data never reaches this API)' })
  paystackStart(@CurrentUser() user: { id: string }) {
    return this.service.startPaystackCardLink(user.id);
  }

  @Post('methods/paystack/confirm')
  @ApiOperation({ summary: 'Confirm a Paystack card link and store the reusable authorization' })
  paystackConfirm(
    @CurrentUser() user: { id: string },
    @Body('reference') reference: string,
  ) {
    return this.service.confirmPaystackCardLink(user.id, reference);
  }

  @Post('methods/paypal/start')
  @ApiOperation({ summary: 'Start PayPal linking — returns the approval URL (billing agreement for automatic monthly billing)' })
  paypalStart() {
    return this.service.paypalStart();
  }

  @Post('methods/paypal/confirm')
  @ApiOperation({ summary: 'Confirm the approved PayPal agreement token and vault it' })
  paypalConfirm(@CurrentUser() user: { id: string }, @Body() dto: PaypalConfirmDto) {
    return this.service.paypalConfirm(user.id, dto.token);
  }

  @Post('pay/mpesa')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiOperation({ summary: 'Pay pending bills via M-Pesa STK push (amount in USD, charged in KES)' })
  payMpesa(@CurrentUser() user: { id: string }, @Body() dto: PayMpesaDto) {
    return this.service.payWithMpesa(user.id, dto);
  }

  @Public()
  @Post('mpesa/callback')
  @ApiOperation({ summary: 'Safaricom Daraja STK push result callback' })
  mpesaCallback(@Body() body: unknown) {
    return this.service.mpesaCallback(body);
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
