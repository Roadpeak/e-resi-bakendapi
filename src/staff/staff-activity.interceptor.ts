import {
  CallHandler, ExecutionContext, Injectable, NestInterceptor,
} from '@nestjs/common';
import { Observable, tap } from 'rxjs';
import { StaffService } from './staff.service.js';

const MUTATIONS = new Set(['POST', 'PATCH', 'PUT', 'DELETE']);

/**
 * Records every mutation a staff member performs while acting as their
 * employer. Reads are deliberately not logged — the productivity page is
 * about work done, not pages viewed.
 */
@Injectable()
export class StaffActivityInterceptor implements NestInterceptor {
  constructor(private readonly staff: StaffService) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<unknown> {
    const req = context.switchToHttp().getRequest<{
      method: string;
      path?: string;
      originalUrl?: string;
      user?: { staff?: { id: string } };
    }>();

    const staffId = req.user?.staff?.id;
    if (!staffId || !MUTATIONS.has(req.method)) return next.handle();

    return next.handle().pipe(
      // Logged only when the handler succeeded — a rejected request is not
      // an operation performed.
      tap(() => void this.staff.recordActivity(staffId, req.method, req.originalUrl ?? req.path ?? '')),
    );
  }
}
