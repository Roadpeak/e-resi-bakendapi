import { Module } from '@nestjs/common';
import { AmenitiesController } from './amenities.controller.js';
import { AmenitiesService } from './amenities.service.js';

@Module({
  controllers: [AmenitiesController],
  providers: [AmenitiesService],
})
export class AmenitiesModule {}
