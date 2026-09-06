import { Module } from '@nestjs/common';
import { RentListingsModule } from '../rent-listings/rent-listings.module.js';
import { ReservationsController } from './reservations.controller.js';
import { ReservationsService } from './reservations.service.js';

@Module({
  imports: [RentListingsModule],
  controllers: [ReservationsController],
  providers: [ReservationsService],
})
export class ReservationsModule {}
