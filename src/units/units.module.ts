import { Module } from '@nestjs/common';
import { UnitsController, UnitsPortfolioController } from './units.controller.js';
import { UnitsService } from './units.service.js';

@Module({
  controllers: [UnitsController, UnitsPortfolioController],
  providers: [UnitsService],
})
export class UnitsModule {}
