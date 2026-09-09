import { Module } from '@nestjs/common';
import { APP_INTERCEPTOR } from '@nestjs/core';
import { StaffController } from './staff.controller.js';
import { StaffService } from './staff.service.js';
import { StaffActivityInterceptor } from './staff-activity.interceptor.js';

@Module({
  controllers: [StaffController],
  providers: [
    StaffService,
    { provide: APP_INTERCEPTOR, useClass: StaffActivityInterceptor },
  ],
  exports: [StaffService],
})
export class StaffModule {}
