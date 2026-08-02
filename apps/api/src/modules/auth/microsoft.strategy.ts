import { Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PassportStrategy } from '@nestjs/passport';
import { Strategy } from 'passport-microsoft';
import type { Profile } from 'passport';
import { Request } from 'express';
import { AuthService } from './auth.service';
import { decodeOauthState } from './oauth-state';

type VerifyCallback = (err: Error | null, user?: unknown) => void;

/**
 * Microsoft (Entra ID) OAuth2 strategy. Mirrors the Google one — same `state`
 * payload, same resolveSsoUser — with one difference that matters.
 *
 * THE EMAIL HAS TO BE THE ORGANISATION'S, NOT THE USER'S CHOICE. Google returns
 * a verified address. Azure has two candidates and they are not equivalent:
 *
 * - `mail` — the mailbox the tenant assigned. Trustworthy.
 * - `userPrincipalName` — a sign-in name. It looks like an email and often
 *   isn't one, and in a tenant you control you can set it to anything.
 *
 * Since login matches an existing user BY EMAIL and signup provisions a tenant
 * keyed on it, accepting a UPN would let someone with their own Azure tenant
 * set a UPN matching one of your users and sign in as them. So
 * `addUPNAsEmail` stays at its default of false — meaning `profile.emails`
 * carries `mail` alone — and a profile without one is refused rather than
 * falling back.
 */
@Injectable()
export class MicrosoftStrategy extends PassportStrategy(Strategy, 'microsoft') {
  constructor(
    config: ConfigService,
    private readonly authService: AuthService,
  ) {
    super({
      clientID: config.getOrThrow<string>('MICROSOFT_CLIENT_ID'),
      clientSecret: config.getOrThrow<string>('MICROSOFT_CLIENT_SECRET'),
      callbackURL: config.getOrThrow<string>('MICROSOFT_CALLBACK_URL'),
      /**
       * Which directories may sign in. `organizations` = work/school accounts
       * from any Azure tenant, the usual choice for a clinical SaaS. Set a
       * specific tenant GUID to restrict to one organisation, or `common` to
       * also admit personal Microsoft accounts — a weaker identity signal,
       * since anyone can create one.
       */
      tenant: config.get<string>('MICROSOFT_TENANT', 'organizations'),
      scope: ['user.read'],
      // Deliberately NOT addUPNAsEmail — see the class comment. The default is
      // already false; stated here so nobody "fixes" a missing-email report by
      // turning it on.
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
          'This Microsoft account has no organisational email address, so it ' +
            'cannot be used to sign in. Ask your IT administrator to assign a ' +
            'mailbox, or sign in with Google instead.',
        );
      }

      const state = decodeOauthState(req.query?.state);
      const user = await this.authService.resolveSsoUser(
        'microsoft',
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
