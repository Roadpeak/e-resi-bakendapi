import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';
import { AdminUsersController } from './admin-users.controller.js';
import { AdminUsersService } from './admin-users.service.js';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  controllers: [AdminController, PricingController, AdminUsersController],
  providers: [AdminService, AuditService, PricingService, AdminUsersService],
  // Exported so later phases (users, pricing, properties) can record actions.
  exports: [AuditService, PricingService],
})
export class AdminModule {}
