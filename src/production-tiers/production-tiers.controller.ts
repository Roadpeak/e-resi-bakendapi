import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { PropertyCategory, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Public } from '../common/decorators/public.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { SetProductionTierDto } from './dto/set-tier.dto.js';
import { ProductionTiersService } from './production-tiers.service.js';
import { PricingService } from '../admin/pricing.service.js';
import { ProductionOrdersService } from './production-orders.service.js';
import { OrderServicesDto } from './dto/order-services.dto.js';

@ApiTags('Production Tiers')
@Controller('production-tiers')
export class ProductionTiersController {
  constructor(
    private readonly service: ProductionTiersService,
    private readonly pricing: PricingService,
    private readonly orders: ProductionOrdersService,
  ) {}

  @Public()
  @Get('catalog')
  @ApiOperation({
    summary: 'Public: production services and the listing fee. Pass propertyType '
      + 'to get the prices that development will actually be billed.',
  })
  @ApiQuery({ name: 'propertyType', enum: PropertyCategory, required: false })
  async catalog(@Query('propertyType') propertyType?: PropertyCategory) {
    const [services, settings] = await Promise.all([
      // Quote the type's own prices, or the catalogue defaults when the caller
      // has not picked a type yet. Without this the wizard would quote default
      // prices and the order would then bill the type price.
      propertyType && Object.values(PropertyCategory).includes(propertyType)
        ? this.pricing.listServicesForType(propertyType)
        : this.pricing.listServices(),
      this.pricing.listSettings('billing'),
    ]);
    const byKey = Object.fromEntries(settings.map((s) => [s.key, s.value]));
    return {
      services,
      listingFee: {
        monthly: Number(byKey.listing_fee_monthly ?? 49),
        currency: byKey.platform_currency ?? byKey.listing_fee_currency ?? 'KES',
        freeMonths: Number(byKey.listing_fee_free_months ?? 0),
      },
      taxRatePercent: Number(byKey.tax_rate_percent ?? 0),
    };
  }

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

  @Post('properties/:slug/services')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({
    summary: 'Developer: order additional production services for a development '
      + 'that already exists. Priced from the catalog at the time of ordering.',
  })
  orderServices(
    @Param('slug') slug: string,
    @Body() dto: OrderServicesDto,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.orders.orderServices(slug, user.id, user.role, dto.services);
  }

  @Get('properties/:slug/services')
  @Roles(UserRole.DEVELOPER, UserRole.ADMIN)
  @ApiBearerAuth()
  @ApiOperation({ summary: 'Developer: production orders for one of your developments' })
  propertyOrders(
    @Param('slug') slug: string,
    @CurrentUser() user: { id: string; role: UserRole },
  ) {
    return this.orders.forProperty(slug, user.id, user.role);
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
