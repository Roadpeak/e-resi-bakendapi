import { Module } from '@nestjs/common';
import { BillingController } from './billing.controller.js';
import { BillingService } from './billing.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';

@Module({
  controllers: [BillingController],
  providers: [BillingService, PaymentProvidersService],
  exports: [BillingService],
})
export class BillingModule {}
