import { forwardRef, Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { BillingModule } from '../billing/billing.module.js';
import { NotificationsModule } from '../notifications/notifications.module.js';
import { ReelsAdminController } from './reels-admin.controller.js';
import { ReelsController } from './reels.controller.js';
import { ReelsService } from './reels.service.js';

@Module({
  imports: [forwardRef(() => AdminModule), BillingModule, NotificationsModule],
  controllers: [ReelsAdminController, ReelsController],
  providers: [ReelsService],
})
export class ReelsModule {}
