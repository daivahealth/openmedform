import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { decodeOauthState } from './oauth-state';

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
      const user = await this.authService.resolveSsoUser(
        'google',
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
