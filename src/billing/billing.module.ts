import { forwardRef, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InvoicesService } from './invoices.service.js';
import { BillingController } from './billing.controller.js';
import { ListingFeeService } from './listing-fee.service.js';
import { BillingService } from './billing.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { PaystackService } from './paystack.service.js';

@Module({
  // AdminModule supplies PricingService; NotificationsModule the in-app feed.
  imports: [forwardRef(() => AdminModule), NotificationsModule],
  controllers: [BillingController],
  providers: [
    BillingService, PaymentProvidersService, PaystackService,
    ListingFeeService, InvoicesService,
  ],
  exports: [BillingService, PaystackService, ListingFeeService, InvoicesService],
})
export class BillingModule {}
