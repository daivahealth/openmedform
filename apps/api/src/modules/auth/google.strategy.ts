import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy, VerifyCallback, Profile } from 'passport-google-oauth20';
import { AuthService } from './auth.service';

/**
 * Google OAuth2 strategy (invite-only match-by-email).
 *
 * Tenant mapping is deliberate: Google accounts are matched against EXISTING
 * active users by email — no user is auto-provisioned. A tenant admin must
 * create the user first (user module). This keeps tenant assignment explicit
 * and audit-safe for clinical data.
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
    });
  }

  async validate(
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
      const user = await this.authService.validateGoogleUser(email);
      done(null, user);
    } catch (err) {
      done(err as Error, false);
    }
  }
}
