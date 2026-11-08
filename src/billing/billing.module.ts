import { forwardRef, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { InvoicesService } from './invoices.service.js';
import { BillingController } from './billing.controller.js';
import { AgentFeeService } from './agent-fee.service.js';
import { ListingFeeService } from './listing-fee.service.js';
import { BillingService } from './billing.service.js';
import { PaymentProvidersService } from './payment-providers.service.js';
import { DocumentPdfService } from './document-pdf.service.js';
import { PaystackService } from './paystack.service.js';
import { DomainBillingService } from './domain-billing.service.js';
import { ListingPlanService } from './listing-plan.service.js';
import { AgentSiteService } from './agent-site.service.js';
import { AgentSiteController } from './agent-site.controller.js';
import { AgentTemplatesService } from './agent-templates.service.js';
import { AgentTemplatesAdminController } from './agent-templates.controller.js';
import { DomainsModule } from '../domains/domains.module.js';

@Module({
  // AdminModule supplies PricingService; NotificationsModule the in-app feed.
  imports: [forwardRef(() => AdminModule), NotificationsModule, DomainsModule],
  controllers: [BillingController, AgentSiteController, AgentTemplatesAdminController],
  providers: [
    DocumentPdfService,
    BillingService, PaymentProvidersService, PaystackService,
    ListingFeeService, AgentFeeService, InvoicesService, DomainBillingService, ListingPlanService, AgentSiteService, AgentTemplatesService,
  ],
  exports: [BillingService, PaystackService, ListingFeeService, AgentFeeService, InvoicesService, DomainBillingService, ListingPlanService],
})
export class BillingModule {}
