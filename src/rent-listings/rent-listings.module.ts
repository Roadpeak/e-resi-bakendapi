import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { RentListingsController } from './rent-listings.controller.js';
import { RentListingsService } from './rent-listings.service.js';
import { OwnershipsController } from './ownerships.controller.js';
import { OwnershipsService } from './ownerships.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [RentListingsController, OwnershipsController],
  providers: [RentListingsService, OwnershipsService],
  exports: [RentListingsService, OwnershipsService],
})
export class RentListingsModule {}
