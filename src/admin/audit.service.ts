import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';
import { PaginationDto } from '../common/dto/pagination.dto.js';

export interface AuditEntry {
  actorId: string;
  /** Dotted verb, e.g. "user.suspend", "pricing.tier.update". */
  action: string;
  targetType?: string;
  targetId?: string;
  summary?: string;
  changes?: Record<string, unknown>;
  ip?: string;
  userAgent?: string;
}

@Injectable()
export class AuditService {
  private readonly logger = new Logger(AuditService.name);

  constructor(private readonly prisma: PrismaService) {}

  /**
   * Record an administrative action.
   *
   * Deliberately never throws: an audit write failing must not roll back the
   * operation the admin actually asked for. Failures are logged instead.
   */
  async record(entry: AuditEntry): Promise<void> {
    try {
      await this.prisma.auditLog.create({
        data: {
          actorId: entry.actorId,
          action: entry.action,
          targetType: entry.targetType,
          targetId: entry.targetId,
          summary: entry.summary,
          changes: entry.changes as object | undefined,
          ip: entry.ip,
          userAgent: entry.userAgent,
        },
      });
    } catch (err) {
      this.logger.error(`Failed to write audit log for ${entry.action}`, err);
    }
  }

  /** Field-level diff, keeping only what actually changed. */
  diff(
    before: Record<string, unknown>,
    after: Record<string, unknown>,
  ): Record<string, { from: unknown; to: unknown }> {
    const changes: Record<string, { from: unknown; to: unknown }> = {};
    for (const key of Object.keys(after)) {
      if (after[key] === undefined) continue;
      if (before[key] !== after[key]) {
        changes[key] = { from: before[key] ?? null, to: after[key] };
      }
    }
    return changes;
  }

  async list(
    pagination: PaginationDto,
    filters: { actorId?: string; action?: string; targetType?: string } = {},
  ) {
    const where = {
      ...(filters.actorId && { actorId: filters.actorId }),
      ...(filters.action && { action: { contains: filters.action, mode: 'insensitive' as const } }),
      ...(filters.targetType && { targetType: filters.targetType }),
    };

    const [data, total] = await Promise.all([
      this.prisma.auditLog.findMany({
        where,
        skip: pagination.skip,
        take: pagination.limit ?? 20,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: { select: { id: true, firstName: true, lastName: true, email: true } },
        },
      }),
      this.prisma.auditLog.count({ where }),
    ]);

    return {
      data,
      meta: {
        total,
        page: pagination.page ?? 1,
        limit: pagination.limit ?? 20,
        totalPages: Math.ceil(total / (pagination.limit ?? 20)),
      },
    };
  }
}
