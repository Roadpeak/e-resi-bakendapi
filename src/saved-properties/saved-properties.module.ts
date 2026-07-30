import { Module } from '@nestjs/common';
import { SavedPropertiesController } from './saved-properties.controller.js';
import { SavedPropertiesService } from './saved-properties.service.js';

@Module({
  controllers: [SavedPropertiesController],
  providers: [SavedPropertiesService],
})
export class SavedPropertiesModule {}
