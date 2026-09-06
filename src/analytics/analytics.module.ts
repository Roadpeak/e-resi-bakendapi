import { Module } from '@nestjs/common';
import { AgentsModule } from '../agents/agents.module.js';
import { AnalyticsController } from './analytics.controller.js';
import { AnalyticsService } from './analytics.service.js';

@Module({
  // AgentsModule for DealsService: capturing an interested viewer as a lead
  // opens a Deal when the capturing side is an agent, under the same rules
  // the deals page applies.
  imports: [AgentsModule],
  controllers: [AnalyticsController],
  providers: [AnalyticsService],
  exports: [AnalyticsService],
})
export class AnalyticsModule {}
