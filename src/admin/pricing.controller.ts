import { Body, Controller, Delete, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { ProductionTierType, UserRole } from '@prisma/client';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { AuditService } from './audit.service.js';
import { ExchangeRateService } from './exchange-rate.service.js';
import { PricingService } from './pricing.service.js';
import {
  CreateServiceDto,
  SetCurrencyDto,
  UpdateServiceDto,
  UpdateSettingDto,
  UpdateTierDto,
} from './dto/pricing.dto.js';

@ApiTags('Admin · Pricing')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/pricing')
export class PricingController {
  constructor(
    private readonly service: PricingService,
    private readonly audit: AuditService,
    private readonly fx: ExchangeRateService,
  ) {}

  @Post('seed')
  @ApiOperation({ summary: 'Admin: populate pricing tables from the built-in defaults (idempotent)' })
  async seed(@CurrentUser() user: { id: string }) {
    const result = await this.service.seedDefaults();
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.seed',
      summary: `Seeded ${result.tiers} tiers, ${result.services} services, ${result.settings} settings`,
    });
    return result;
  }

  // ─── Production tiers ─────────────────────────────────────────────────────

  @Get('tiers')
  @ApiOperation({ summary: 'Admin: list production tier pricing' })
  listTiers() {
    return this.service.listTiers(true);
  }

  @Get('tiers/:tier/impact')
  @ApiOperation({ summary: 'Admin: how many properties a tier price change affects' })
  tierImpact(@Param('tier') tier: ProductionTierType) {
    return this.service.tierImpact(tier);
  }

  @Patch('tiers/:id')
  @ApiOperation({ summary: 'Admin: update a production tier price or features' })
  async updateTier(
    @Param('id') id: string,
    @Body() dto: UpdateTierDto,
    @CurrentUser() user: { id: string },
  ) {
    const { before, after } = await this.service.updateTier(id, dto);
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.tier.update',
      targetType: 'PricingPlan',
      targetId: id,
      summary: `${after.label}: ${before.price} → ${after.price} ${after.currency}`,
      changes: this.audit.diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
    });
    return after;
  }

  // ─── Service catalogue ────────────────────────────────────────────────────

  @Get('services')
  @ApiOperation({ summary: 'Admin: list production services' })
  listServices() {
    return this.service.listServices(true);
  }

  @Post('services')
  @ApiOperation({ summary: 'Admin: add a production service' })
  async createService(@Body() dto: CreateServiceDto, @CurrentUser() user: { id: string }) {
    const created = await this.service.createService(dto);
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.service.create',
      targetType: 'ServiceCatalogItem',
      targetId: created.id,
      summary: `Added ${created.label} at ${created.price} ${created.currency}`,
    });
    return created;
  }

  @Patch('services/:id')
  @ApiOperation({ summary: 'Admin: update a production service' })
  async updateService(
    @Param('id') id: string,
    @Body() dto: UpdateServiceDto,
    @CurrentUser() user: { id: string },
  ) {
    const { before, after } = await this.service.updateService(id, dto as Record<string, unknown>);
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.service.update',
      targetType: 'ServiceCatalogItem',
      targetId: id,
      summary: `${after.label}: ${before.price} → ${after.price} ${after.currency}`,
      changes: this.audit.diff(before as unknown as Record<string, unknown>, dto as Record<string, unknown>),
    });
    return after;
  }

  @Get('exchange-rate')
  @ApiOperation({
    summary: 'Live exchange rate between two currencies, with the time it was '
      + 'fetched so the UI can flag a stale figure.',
  })
  exchangeRate(@Query('from') from: string, @Query('to') to: string) {
    return this.fx.getRate(from ?? 'USD', to ?? 'KES');
  }

  @Post('currency')
  @ApiOperation({
    summary: 'Set the platform billing currency and restate catalog prices. '
      + 'rate multiplies every price (1 = relabel without converting). '
      + 'Existing invoices and orders are never touched.',
  })
  async setCurrency(
    @Body() dto: SetCurrencyDto,
    @CurrentUser() actor: { id: string },
  ) {
    const result = await this.service.setPlatformCurrency(
      dto.currency, dto.rate ?? 1, dto.useLiveRate ?? false,
    );
    await this.audit.record({
      actorId: actor.id,
      action: 'pricing.currency.change',
      targetType: 'PlatformSetting',
      targetId: 'platform_currency',
      summary: `Platform currency → ${result.currency}`
        + (result.rate !== 1
          ? ` (prices × ${result.rate} from ${result.rateSource})`
          : ' (relabelled, prices unchanged)'),
    });
    return result;
  }

  @Delete('services/:id')
  @ApiOperation({ summary: 'Admin: retire a service (soft delete — past orders reference it)' })
  async removeService(@Param('id') id: string, @CurrentUser() user: { id: string }) {
    const removed = await this.service.removeService(id);
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.service.retire',
      targetType: 'ServiceCatalogItem',
      targetId: id,
      summary: `Retired ${removed.label}`,
    });
    return removed;
  }

  // ─── Platform settings ────────────────────────────────────────────────────

  @Get('settings')
  @ApiOperation({ summary: 'Admin: list platform settings (listing fee, tax, currency)' })
  @ApiQuery({ name: 'group', required: false })
  listSettings(@Query('group') group?: string) {
    return this.service.listSettings(group);
  }

  @Patch('settings/:key')
  @ApiOperation({ summary: 'Admin: update a platform setting' })
  async updateSetting(
    @Param('key') key: string,
    @Body() dto: UpdateSettingDto,
    @CurrentUser() user: { id: string },
  ) {
    const { before, after } = await this.service.updateSetting(key, dto.value);
    await this.audit.record({
      actorId: user.id,
      action: 'pricing.setting.update',
      targetType: 'PlatformSetting',
      targetId: key,
      summary: `${after.label}: ${before.value} → ${after.value}`,
    });
    return after;
  }
}
