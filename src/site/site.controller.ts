import { Controller, Get } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { Public } from '../common/decorators/public.decorator.js';
import { SiteService } from './site.service.js';

@ApiTags('Site')
@Controller('site')
export class SiteController {
  constructor(private readonly site: SiteService) {}

  @Public()
  @Get('home-3d')
  @ApiOperation({ summary: 'Public: the homepage 3D showcase models (outside / inside)' })
  home3d() { return this.site.home3d(); }
}
