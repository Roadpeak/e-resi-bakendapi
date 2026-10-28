import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminModule } from '../admin/admin.module.js';
import { DomainsModule } from '../domains/domains.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { NearbyPlacesService } from './nearby-places.service.js';
import { PropertiesController } from './properties.controller.js';
import { PropertiesService } from './properties.service.js';

@Module({
  imports: [AdminModule, NotificationsModule, DomainsModule, BillingModule],
  controllers: [PropertiesController],
  providers: [PropertiesService, NearbyPlacesService],
  exports: [PropertiesService],
})
export class PropertiesModule {}
