import { Body, Controller, Get, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiPropertyOptional, ApiTags } from '@nestjs/swagger';
import { PaymentStatus, ProductionOrderStatus, UserRole } from '@prisma/client';
import { IsDateString, IsEnum, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser } from '../common/decorators/current-user.decorator.js';
import { Roles } from '../common/decorators/roles.decorator.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';
import { AdminBillingService } from './admin-billing.service.js';
import { AuditService } from './audit.service.js';

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

@ApiTags('Admin · Billing')
@ApiBearerAuth()
@Roles(UserRole.ADMIN)
@Controller('admin/billing')
export class AdminBillingController {
  constructor(
    private readonly service: AdminBillingService,
    private readonly audit: AuditService,
  ) {}

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
  @ApiOperation({ summary: 'Admin: production orders by stage' })
  orders(@Query('status') status?: ProductionOrderStatus) {
    return this.service.productionOrders(status);
  }

  @Patch('production-orders/:id')
  @ApiOperation({ summary: 'Admin: move a production order along or schedule it' })
  async updateOrder(
    @Param('id') id: string,
    @Body() dto: UpdateOrderDto,
    @CurrentUser() actor: { id: string },
  ) {
    const { before, after } = await this.service.updateOrder(id, dto);
    await this.audit.record({
      actorId: actor.id,
      action: 'production.order.update',
      targetType: 'ProductionTier',
      targetId: id,
      summary: `${after.property?.name ?? 'Order'}: ${before.orderStatus} → ${after.orderStatus}`,
      changes: this.audit.diff(
        { orderStatus: before.orderStatus },
        { orderStatus: after.orderStatus },
      ),
    });
    return after;
  }
}
