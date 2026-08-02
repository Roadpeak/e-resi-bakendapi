import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';
import { PricingController } from './pricing.controller.js';
import { PricingService } from './pricing.service.js';

@Module({
  controllers: [AdminController, PricingController],
  providers: [AdminService, AuditService, PricingService],
  // Exported so later phases (users, pricing, properties) can record actions.
  exports: [AuditService, PricingService],
})
export class AdminModule {}
