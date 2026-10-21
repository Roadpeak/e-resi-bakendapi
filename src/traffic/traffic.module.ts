import { Module } from '@nestjs/common';
import { AdminTrafficController, TrafficController } from './traffic.controller.js';
import { TrafficService } from './traffic.service.js';

@Module({
  controllers: [TrafficController, AdminTrafficController],
  providers: [TrafficService],
})
export class TrafficModule {}
