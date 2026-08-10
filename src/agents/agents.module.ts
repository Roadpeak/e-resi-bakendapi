import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AgentsController } from './agents.controller.js';
import { AgentsService } from './agents.service.js';
import { PartnershipsController } from './partnerships.controller.js';
import { PartnershipsService } from './partnerships.service.js';

@Module({
  imports: [NotificationsModule],
  controllers: [AgentsController, PartnershipsController],
  providers: [AgentsService, PartnershipsService],
  exports: [AgentsService, PartnershipsService],
})
export class AgentsModule {}
