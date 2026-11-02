import { Module } from '@nestjs/common';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { AdminSupportController, SupportController } from './support.controller.js';
import { SupportService } from './support.service.js';
import { SupportThrottlerGuard } from './support-throttler.guard.js';

@Module({
  imports: [NotificationsModule],
  controllers: [SupportController, AdminSupportController],
  providers: [SupportService, SupportThrottlerGuard],
})
export class SupportModule {}
