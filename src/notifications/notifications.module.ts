import { Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller.js';
import { NotificationsService } from './notifications.service.js';
import { PlatformEventsService } from './platform-events.service.js';

@Module({
  controllers: [NotificationsController],
  providers: [NotificationsService, PlatformEventsService],
  exports: [NotificationsService, PlatformEventsService],
})
export class NotificationsModule {}
