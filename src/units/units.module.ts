import { Module } from '@nestjs/common';
import { UnitsController, UnitsPortfolioController } from './units.controller.js';
import { UnitsService } from './units.service.js';
import { UnitTypesController } from './unit-types.controller.js';
import { UnitTypesService } from './unit-types.service.js';

@Module({
  controllers: [UnitTypesController, UnitsController, UnitsPortfolioController],
  providers: [UnitsService, UnitTypesService],
})
export class UnitsModule {}
