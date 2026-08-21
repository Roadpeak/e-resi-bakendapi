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
      // The chosen role rides along in `state`; without this passport drops it.
      state: true,
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
