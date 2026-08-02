import { Module } from '@nestjs/common';
import { AdminController } from './admin.controller.js';
import { AdminService } from './admin.service.js';
import { AuditService } from './audit.service.js';

@Module({
  controllers: [AdminController],
  providers: [AdminService, AuditService],
  // Exported so later phases (users, pricing, properties) can record actions.
  exports: [AuditService],
})
export class AdminModule {}
