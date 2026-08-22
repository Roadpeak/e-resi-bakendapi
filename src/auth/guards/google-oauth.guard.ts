import { ExecutionContext, Injectable, Logger } from '@nestjs/common';
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
  private readonly logger = new Logger(GoogleOAuthGuard.name);

  /**
   * Turn a strategy failure into something the user can act on.
   *
   * Anything thrown in here happens before the controller runs, so its
   * try/catch never sees it and the visitor gets a raw 500 JSON body at a
   * Google callback URL — with the real cause visible only in server logs.
   * Logging it here and rethrowing keeps the diagnosis while letting the
   * exception filter render a page rather than a stack trace.
   */
  handleRequest<TUser>(err: unknown, user: TUser, info: unknown): TUser {
    if (err || !user) {
      const reason = err instanceof Error
        ? err.message
        : String((info as { message?: string })?.message ?? info ?? 'unknown');
      this.logger.error(`Google sign-in failed before the callback ran: ${reason}`);
    }
    return super.handleRequest(err, user, info, null as never);
  }

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
