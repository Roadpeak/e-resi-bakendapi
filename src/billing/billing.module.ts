import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { BillingController } from './billing.controller.js';
import { ListingFeeService } from './listing-fee.service.js';
import { BillingService } from './billing.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { PaystackService } from './paystack.service.js';

@Module({
  // AdminModule supplies PricingService — the listing fee is admin-managed.
  imports: [AdminModule],
  controllers: [BillingController],
  providers: [BillingService, PaymentProvidersService, PaystackService, ListingFeeService],
  exports: [BillingService, PaystackService, ListingFeeService],
})
export class BillingModule {}
