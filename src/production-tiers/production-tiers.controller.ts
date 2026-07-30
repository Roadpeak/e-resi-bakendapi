import { Body, Controller, Get, Param, Post } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import { UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { SetProductionTierDto } from './dto/set-tier.dto.js';
import { ProductionTiersService } from './production-tiers.service.js';

@ApiTags('Production Tiers')
@Controller('production-tiers')
export class ProductionTiersController {
  constructor(private readonly service: ProductionTiersService) {}

  @Public()
  @Get('pricing')
  @ApiOperation({ summary: 'Public: get tier pricing and features' })
  getPricing() {
    return this.service.getPricing();
  }

  @Public()
  @Get('properties/:slug')
  @ApiOperation({ summary: 'Public: get production tier for a property' })
  getForProperty(@Param('slug') slug: string) {
    return this.service.getForProperty(slug);
  }

  @Post()
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer/Admin: set or upgrade production tier for a property' })
  setTier(
    @Body() dto: SetProductionTierDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.service.setTier(dto, user.id, user.role);
  }

  @Get('my')
  @Roles(UserRole.DEVELOPER)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: list own properties and their tiers' })
  developerTiers(@CurrentUser() user: { id: string }) {
    return this.service.developerTiers(user.id);
  }

  @Get('admin/all')
  @Roles(UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Admin: list all production tiers' })
  adminListAll() {
    return this.service.adminListAll();
  }
}
