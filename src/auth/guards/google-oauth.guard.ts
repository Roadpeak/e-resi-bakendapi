import { ExecutionContext, Injectable } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import type { Request } from 'express';

/**
 * Drives the Google strategy, and carries the chosen role across the redirect.
 *
 * Google hands back nothing but the profile, so the account type picked on the
 * register screen has to survive the round-trip. OAuth `state` is the field for
 * that: it is echoed back verbatim on the callback. Passport only forwards it
 * when given here, per-request, since it is not known at strategy construction.
 */
@Injectable()
export class GoogleOAuthGuard extends AuthGuard('google') {
  getAuthenticateOptions(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<Request>();
    const role = String(req.query.role ?? '').toUpperCase();

    return {
      // Only these two are offered; the callback re-validates rather than
      // trusting whatever comes back.
      state: role === 'TENANT' ? 'TENANT' : 'INVESTOR',
    };
  }
}
