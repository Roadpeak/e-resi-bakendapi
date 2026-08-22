import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, type Profile, type VerifyCallback } from 'passport-google-oauth20';
import { resolveAppUrl } from '../../common/app-url.js';

/** The profile fields the callback hands on to AuthService. */
export interface GoogleProfile {
  googleId: string;
  email: string;
  firstName: string;
  lastName: string;
  avatarUrl?: string;
  /** Google's own verification of the address — not our email-verify flow. */
  emailVerified: boolean;
}

/**
 * Google OAuth2. Registered only when GOOGLE_CLIENT_ID and GOOGLE_CLIENT_SECRET
 * are set — see AuthModule, which omits this provider otherwise so that an
 * environment without Google credentials still boots.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(config: ConfigService) {
    super({
      clientID: config.get<string>('GOOGLE_CLIENT_ID')!,
      clientSecret: config.get<string>('GOOGLE_CLIENT_SECRET')!,
      // Must match a redirect URI registered in the Google console exactly.
      // Derived from the API's own public origin, not the frontend's.
      callbackURL:
        config.get<string>('GOOGLE_CALLBACK_URL')
        ?? `${resolveAppUrl(config)}/api/auth/google/callback`,
      scope: ['email', 'profile'],
      // Deliberately NOT `state: true`. That switches passport-oauth2 to its
      // session-backed state store, which stores the value on the outbound
      // leg and verifies it on the callback — and throws "OAuth 2.0
      // authentication requires session support when using state" when there
      // is no session. This API is stateless JWT with no session middleware,
      // so every callback failed with a raw 500: the throw happens inside the
      // guard, before the controller's try/catch can turn it into a redirect.
      //
      // The role still travels: GoogleOAuthGuard passes `state` as a string
      // per request, which passport forwards as a plain query parameter. That
      // is safe here because the value is not a secret and is not trusted —
      // the callback re-validates it down to INVESTOR or TENANT rather than
      // believing whatever comes back.
    });
  }

  validate(
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): void {
    const email = profile.emails?.[0];
    if (!email?.value) {
      // Every downstream step keys off the address; without one there is no
      // account to find or create.
      done(new Error('Google account has no email address'), false);
      return;
    }

    const mapped: GoogleProfile = {
      googleId: profile.id,
      email: email.value.toLowerCase(),
      firstName: profile.name?.givenName ?? profile.displayName ?? 'User',
      lastName: profile.name?.familyName ?? '',
      avatarUrl: profile.photos?.[0]?.value,
      // passport types this loosely; Google sends a boolean-ish `verified`.
      emailVerified: (email as { verified?: boolean | string }).verified === true
        || (email as { verified?: boolean | string }).verified === 'true',
    };

    done(null, mapped);
  }
}
