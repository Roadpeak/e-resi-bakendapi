import { Module } from '@nestjs/common';
import { ToursController } from './tours.controller.js';
import { ToursService } from './tours.service.js';

@Module({
  controllers: [ToursController],
  providers: [ToursService],
})
export class ToursModule {}
