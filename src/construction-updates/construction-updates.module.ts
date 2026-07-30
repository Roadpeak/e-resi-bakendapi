import { Module } from '@nestjs/common';
import { ConstructionUpdatesController } from './construction-updates.controller.js';
import { ConstructionUpdatesService } from './construction-updates.service.js';

@Module({
  controllers: [ConstructionUpdatesController],
  providers: [ConstructionUpdatesService],
})
export class ConstructionUpdatesModule {}
