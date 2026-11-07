import { Module } from '@nestjs/common';
import { LeadsController } from './leads.controller.js';
import { LeadsService } from './leads.service.js';
import { AnalyticsModule } from '../analytics/analytics.module.js';

@Module({
  // Signed-in customers who opened a development are automatic leads too;
  // AnalyticsService already works out who they are for the analytics page.
  imports: [AnalyticsModule],
  controllers: [LeadsController],
  providers: [LeadsService],
})
export class LeadsModule {}
