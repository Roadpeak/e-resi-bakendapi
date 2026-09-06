import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { PartnershipsController } from './partnerships.controller.js';
import { PartnershipsService } from './partnerships.service.js';
import { DealsController } from './deals.controller.js';
import { DealsService } from './deals.service.js';
import { ClientRoomsController } from './client-rooms.controller.js';
import { ClientRoomsService } from './client-rooms.service.js';
import { MandatesController } from './mandates.controller.js';
import { MandatesService } from './mandates.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [
    AgentsController,
    PartnershipsController,
    DealsController,
    ClientRoomsController,
    MandatesController,
  ],
  providers: [
    AgentsService,
    PartnershipsService,
    DealsService,
    ClientRoomsService,
    MandatesService,
  ],
  exports: [AgentsService, PartnershipsService, DealsService],
})
export class AgentsModule {}
