import { forwardRef, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ServiceRequestsAdminController } from './service-requests-admin.controller.js';
import { ServiceRequestsController } from './service-requests.controller.js';
import { ServiceRequestsService } from './service-requests.service.js';

@Module({
  imports: [forwardRef(() => AdminModule), BillingModule, NotificationsModule],
  controllers: [ServiceRequestsAdminController, ServiceRequestsController],
  providers: [ServiceRequestsService],
})
export class ServiceRequestsModule {}
