import { Module } from '@nestjs/common';
import { AdminModule } from '../admin/admin.module.js';
import { ProductionTiersController } from './production-tiers.controller.js';
import { ProductionTiersService } from './production-tiers.service.js';

@Module({
  imports: [AdminModule],
  controllers: [ProductionTiersController],
  providers: [ProductionTiersService],
})
export class ProductionTiersModule {}
