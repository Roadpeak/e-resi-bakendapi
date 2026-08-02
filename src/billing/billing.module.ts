import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { PaystackService } from './paystack.service.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PaymentProvidersService, PaystackService],
  exports: [BillingService, PaystackService],
})
export class BillingModule {}
