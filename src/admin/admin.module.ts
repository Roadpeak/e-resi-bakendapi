import { forwardRef, Module } from '@nestjs/common';
import { BillingModule } from '../billing/billing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { MailModule } from '../mail/mail.module.js';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';
import { AdminBillingController } from './admin-billing.controller.js';
import { AdminOpsController } from './admin-ops.controller.js';
import { AdminSystemController } from './admin-system.controller.js';
import { AdminSystemService } from './admin-system.service.js';
import { AdminOpsService } from './admin-ops.service.js';
import { AdminBillingService } from './admin-billing.service.js';
import { AdminPropertiesController } from './admin-properties.controller.js';
import { AdminPropertiesService } from './admin-properties.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';
import { ProductionOrdersService } from '../production-tiers/production-orders.service.js';

@Module({
  // forwardRef: BillingModule imports AdminModule for pricing, and production
  // orders here need InvoicesService to bill a scheduled shoot.
  imports: [MailModule, NotificationsModule, forwardRef(() => BillingModule)],
  controllers: [AdminController, PricingController, AdminUsersController, AdminPropertiesController, AdminBillingController, AdminOpsController, AdminSystemController],
  providers: [AdminService, AuditService, PricingService, ProductionOrdersService, AdminUsersService, AdminPropertiesService, AdminBillingService, AdminOpsService, AdminSystemService],
  // Exported so later phases (users, pricing, properties) can record actions.
  exports: [AuditService, PricingService, ProductionOrdersService],
})
export class AdminModule {}
