import { ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';

/**
 * For @Public routes that behave differently when someone is signed in.
 *
 * The global JwtAuthGuard skips public routes entirely, so request.user is
 * never set there. This guard reads a bearer token when one is present and
 * lets the request through without one — no token means a visitor. A token
 * that is present but expired still answers 401, so the client refreshes and
 * retries as the signed-in user instead of silently becoming a visitor.
 */
@Injectable()
export class OptionalJwtGuard extends AuthGuard('jwt') {
  canActivate(ctx: ExecutionContext) {
    const req = ctx.switchToHttp().getRequest<{ headers: Record<string, string | undefined> }>();
    if (!req.headers.authorization?.startsWith('Bearer ')) return true;
    return super.canActivate(ctx);
  }

  handleRequest<TUser>(_err: unknown, user: TUser): TUser {
    // Only reached when a bearer token was sent (see canActivate).
    if (!user) throw new UnauthorizedException();
    return user;
  }
}
