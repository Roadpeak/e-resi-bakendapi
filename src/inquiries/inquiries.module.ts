import { Module } from '@nestjs/common';
import { InquiriesController } from './inquiries.controller.js';
import { InquiriesService } from './inquiries.service.js';

@Module({
  controllers: [InquiriesController],
  providers: [InquiriesService],
})
export class InquiriesModule {}
