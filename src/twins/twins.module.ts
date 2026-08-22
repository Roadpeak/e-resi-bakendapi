import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { TwinsController } from './twins.controller.js';
import { TwinsService } from './twins.service.js';

@Module({
  imports: [MediaModule],
  controllers: [TwinsController],
  providers: [TwinsService],
  exports: [TwinsService],
})
export class TwinsModule {}
