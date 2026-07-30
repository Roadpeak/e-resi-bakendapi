import { Module } from '@nestjs/common';
import { RentListingsController } from './rent-listings.controller.js';
import { RentListingsService } from './rent-listings.service.js';

@Module({
  controllers: [RentListingsController],
  providers: [RentListingsService],
})
export class RentListingsModule {}
