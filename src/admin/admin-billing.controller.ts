import { Body, Controller, ForbiddenException, Get, Inject, Param, Patch, Post, Query, Req, forwardRef } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import * as bcrypt from 'bcryptjs';
import type { Request } from 'express';
import { InvoicesService } from '../billing/invoices.service.js';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PaymentStatus, ProductionOrderStatus, UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsNotEmpty, IsOptional, IsString, MaxLength, MinLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminBillingService } from './admin-billing.service.js';
import { AuditService } from './audit.service.js';
import { ProductionOrdersService } from '../production-tiers/production-orders.service.js';

/** Extends PaginationDto — forbidNonWhitelisted rejects undeclared params. */
class ListPaymentsDto extends PaginationDto {
  @ApiPropertyOptional({ enum: PaymentStatus })
  @IsOptional()
  @IsEnum(PaymentStatus)
  status?: PaymentStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  userId?: string;
}

class UpdateOrderDto {
  @ApiPropertyOptional({ enum: ProductionOrderStatus })
  @IsOptional()
  @IsEnum(ProductionOrderStatus)
  orderStatus?: ProductionOrderStatus;

  @ApiPropertyOptional()
  @IsOptional()
  @IsDateString()
  scheduledAt?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  crewNotes?: string;
}

/**
 * bcrypt hash of the invoice-waiver passcode. Only the hash lives in the
 * code; set INVOICE_WAIVER_PASSCODE_HASH on the server to change it.
 */
const WAIVER_PASSCODE_HASH = '$2b$12$JQVjHkvtXlF3mDnhY6RzrOZ8xrp..4.cr/4fSSFZwIjv7baRnQUq6';

class WaiveInvoiceDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(32)
  passcode: string;

  /** Why — kept on the invoice and in the audit log. */
  @IsString()
  @MinLength(3, { message: 'Give a short reason for the waiver' })
  @MaxLength(500)
  reason: string;
}

@ApiTags('Admin · Billing')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly service: AdminBillingService,
    private readonly audit: AuditService,
    private readonly orders_: ProductionOrdersService,
    @Inject(forwardRef(() => InvoicesService)) private readonly invoices: InvoicesService,
    private readonly config: ConfigService,
  ) {}

  /**
   * Waive an unpaid monthly listing-fee invoice — clear a developer's or
   * agent's listing fee without payment. Other invoices can't be waived. Requires the waiver passcode (checked here, never sent to the
   * browser), and is written to the audit log either way: who waived what,
   * for whom, how much and why; a wrong passcode is logged as a denial.
   */
  @Post('invoices/:id/waive')
  @ApiOperation({ summary: 'Admin: waive an unpaid monthly listing-fee invoice (passcode required, audited)' })
  async waiveInvoice(
    @Param('id') id: string,
    @Body() dto: WaiveInvoiceDto,
    @CurrentUser() actor: { id: string; firstName?: string; lastName?: string },
    @Req() req: Request,
  ) {
    const hash = this.config.get<string>('INVOICE_WAIVER_PASSCODE_HASH') || WAIVER_PASSCODE_HASH;
    const ok = await bcrypt.compare(dto.passcode.trim(), hash).catch(() => false);
    const meta = { ip: req.ip, userAgent: req.headers['user-agent']?.slice(0, 300) };
    if (!ok) {
      await this.audit.record({
        actorId: actor.id, action: 'billing.invoice.waive_denied', targetType: 'Invoice', targetId: id,
        summary: 'Invoice waiver attempted with a wrong passcode', ...meta,
      });
      throw new ForbiddenException('Incorrect passcode');
    }
    const inv = await this.invoices.waive({ invoiceId: id, actorId: actor.id, reason: dto.reason.trim() });
    await this.audit.record({
      actorId: actor.id, action: 'billing.invoice.waive', targetType: 'Invoice', targetId: id,
      summary: `Waived listing fee ${inv.number} for ${inv.billedToName} (${inv.billedToEmail}): ${inv.currency} ${inv.total.toLocaleString()} — ${dto.reason.trim()}`,
      changes: { status: { from: 'UNPAID', to: 'WAIVED' }, reason: dto.reason.trim(), kind: inv.kind },
      ...meta,
    });
    return inv;
  }

  @Get('summary')
  @ApiOperation({ summary: 'Admin: platform revenue, pending and recurring' })
  summary() {
    return this.service.summary();
  }

  @Get('payments')
  @ApiOperation({ summary: 'Admin: all payments, filterable by status' })
  payments(@Query() query: ListPaymentsDto) {
    const { status, userId, ...pagination } = query;
    return this.service.payments(pagination as PaginationDto, { status, userId });
  }

  @Post('payments/:id/refund')
  @ApiOperation({ summary: 'Admin: mark a payment refunded' })
  async refund(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    const { before, after } = await this.service.refund(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'payment.refund',
      targetType: 'Payment',
      targetId: id,
      summary: `Refunded ${after.amount} ${after.currency}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }

  @Post('payments/:id/retry')
  @ApiOperation({ summary: 'Admin: re-queue a failed payment' })
  async retry(@Param('id') id: string, @CurrentUser() actor: { id: string }) {
    const { before, after } = await this.service.retry(id);
    await this.audit.record({
      actorId: actor.id,
      action: 'payment.retry',
      targetType: 'Payment',
      targetId: id,
      summary: `Re-queued ${after.amount} ${after.currency}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }

  // ─── Production orders ────────────────────────────────────────────────────

  @Get('production-orders')
  @ApiOperation({
    summary: 'Admin: production orders by stage — one row per ordered service',
  })
  orders(@Query('status') status?: ProductionOrderStatus) {
    return this.orders_.list({ status });
  }

  @Post('production-orders/backfill')
  @ApiOperation({
    summary: 'Admin: create order rows for services selected before per-service '
      + 'orders existed. Idempotent, and raises no invoices.',
  })
  backfillOrders() {
    return this.orders_.backfill();
  }

  @Patch('production-orders/:id')
  @ApiOperation({ summary: 'Admin: move a production order along or schedule it' })
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: { id: string },
  ) {
    // The DTO keeps its original `orderStatus` name so existing admin clients
    // keep working; the per-service order model calls the column `status`.
    const { before, after } = await this.orders_.update(id, {
      status: dto.orderStatus,
      scheduledAt: dto.scheduledAt,
      crewNotes: dto.crewNotes,
    });
    await this.audit.record({
      actorId: actor.id,
      action: 'production.order.update',
      targetType: 'ProductionOrder',
      targetId: id,
      summary: `${after.property?.name ?? 'Order'} · ${after.label}: ${before.status} → ${after.status}`,
      changes: this.audit.diff({ status: before.status }, { status: after.status }),
    });
    return after;
  }
}
