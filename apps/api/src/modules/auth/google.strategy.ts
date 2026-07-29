import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { Request } from 'express';
import { AuthService } from './auth.service';

/**
 * Google OAuth2 strategy.
 *
 * The intent (login vs signup, plus signup's organization + country) is
 * carried through the OAuth `state` parameter set by GoogleAuthGuard, so the
 * same callback serves both:
 * - login: match an EXISTING active user by email (invite-only; unknown emails
 *   are rejected).
 * - signup: provision a new tenant + first TENANT_ADMIN with the requested
 *   organization name and country (see AuthService.resolveGoogleUser).
 *
 * `passReqToCallback` gives validate() access to `req.query.state`.
 */
@Injectable()
export class GoogleStrategy extends PassportStrategy(Strategy, 'google') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('GOOGLE_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('GOOGLE_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('GOOGLE_CALLBACK_URL'),
      scope: ['email', 'profile'],
      passReqToCallback: true,
    });
  }

  async validate(
    req: Request,
    _accessToken: string,
    _refreshToken: string,
    profile: Profile,
    done: VerifyCallback,
  ): Promise<void> {
    try {
      const email = profile.emails?.[0]?.value;
      if (!email) {
        throw new UnauthorizedException(
          'Google account did not return an email address',
        );
      }
      const state = decodeOauthState(req.query?.state);
      const user = await this.authService.resolveGoogleUser(
        email,
        profile.displayName,
        state.mode,
        state.signup,
        req.ip,
      );
      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }
}

export interface GoogleSignupDetails {
  organizationName: string;
  country: string;
}

/**
 * Decode the OAuth `state` payload produced by GoogleAuthGuard (base64url
 * JSON). Tolerates the legacy plain 'signup'/'login' strings from older
 * links; anything unparseable degrades safely to login intent.
 */
export function decodeOauthState(raw: unknown): {
  mode: 'login' | 'signup';
  signup?: GoogleSignupDetails;
} {
  if (raw === 'signup' || raw === 'login') {
    return { mode: raw };
  }
  if (typeof raw === 'string' && raw) {
    try {
      const payload = JSON.parse(
        Buffer.from(raw, 'base64url').toString('utf8'),
      );
      if (payload?.m === 'l') {
        return { mode: 'login' };
      }
      const organizationName = String(payload?.o ?? '').trim();
      const country = String(payload?.c ?? '').trim();
      if (payload?.m === 's' && organizationName && country) {
        return {
          mode: 'signup',
          signup: {
            organizationName: organizationName.slice(0, 255),
            country: country.slice(0, 100),
          },
        };
      }
    } catch {
      // fall through to safe default
    }
  }
  return { mode: 'login' };
}
