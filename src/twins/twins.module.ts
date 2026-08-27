import { Module } from '@nestjs/common';
import { MediaModule } from '../media/media.module.js';
import { TwinsController } from './twins.controller.js';
import { TwinsService } from './twins.service.js';
import { PanoramaService } from './panorama/panorama.service.js';

@Module({
  imports: [MediaModule],
  controllers: [TwinsController],
  providers: [TwinsService, PanoramaService],
  exports: [TwinsService, PanoramaService],
})
export class TwinsModule {}
