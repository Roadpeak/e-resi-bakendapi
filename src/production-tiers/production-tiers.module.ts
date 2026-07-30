import { Module } from '@nestjs/common';
import { ProductionTiersController } from './production-tiers.controller.js';
import { ProductionTiersService } from './production-tiers.service.js';

@Module({
  controllers: [ProductionTiersController],
  providers: [ProductionTiersService],
})
export class ProductionTiersModule {}
