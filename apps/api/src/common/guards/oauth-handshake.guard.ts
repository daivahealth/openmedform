/**
 * The guard that starts an SSO handshake, shared by every provider.
 *
 * Both providers need exactly the same three things, and the only differences
 * are which passport strategy to invoke and which env var says it is
 * configured. Writing that twice would mean two places to keep the signup
 * contract in step — and the signup path provisions a tenant, so a drift there
 * is not cosmetic.
 *
 * `AuthGuard()` is a mixin factory, so this is a factory too rather than an
 * abstract base.
 */

import {
  BadRequestException,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
  type Type,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard, type IAuthGuard } from '@nestjs/passport';
import { Request } from 'express';
import { isSsoCredentialConfigured } from '../utils/sso-config';

export interface OAuthGuardOptions {
  /** Passport strategy name, e.g. 'google'. */
  strategy: string;
  /** Env var whose real (non-placeholder) value means this provider is on. */
  clientIdEnv: string;
  /** Shown to the user when it is not, e.g. 'Google'. */
  displayName: string;
}

export function createOAuthHandshakeGuard({
  strategy,
  clientIdEnv,
  displayName,
}: OAuthGuardOptions): Type<IAuthGuard> {
  @Injectable()
  class OAuthHandshakeGuard extends AuthGuard(strategy) {
    constructor(private readonly config: ConfigService) {
      super();
    }

    canActivate(context: ExecutionContext) {
      const clientId = this.config.get<string>(clientIdEnv);
      // Placeholders count as unconfigured, so the button never sends users
      // off with a credential that only looks real. See isSsoCredentialConfigured.
      if (!isSsoCredentialConfigured(clientId)) {
        throw new ServiceUnavailableException(
          `${displayName} sign-in is not configured on this server`,
        );
      }
      return super.canActivate(context);
    }

    /**
     * Carry the login/signup intent through the OAuth `state` param, so the
     * callback knows what to do. Signup requires the organization name and
     * country up front — they become the new tenant and cannot be derived
     * reliably from an SSO profile, so the handshake is rejected without them.
     *
     * Started from `GET /api/auth/<provider>?mode=signup&org=...&country=...`;
     * anything else defaults to login. State is a base64url JSON payload; the
     * legacy plain 'signup'/'login' strings are still accepted by the decoder.
     */
    getAuthenticateOptions(context: ExecutionContext) {
      const req = context.switchToHttp().getRequest<Request>();
      const mode = req.query?.mode === 'signup' ? 'signup' : 'login';

      if (mode === 'signup') {
        const organizationName = String(req.query?.org ?? '').trim();
        const country = String(req.query?.country ?? '').trim();
        if (!organizationName || !country) {
          throw new BadRequestException(
            'Organization and country are required to sign up.',
          );
        }
        if (organizationName.length > 255 || country.length > 100) {
          throw new BadRequestException('Organization or country is too long.');
        }
        return {
          state: Buffer.from(
            JSON.stringify({ m: 's', o: organizationName, c: country }),
          ).toString('base64url'),
        };
      }

      return {
        state: Buffer.from(JSON.stringify({ m: 'l' })).toString('base64url'),
      };
    }
  }

  return OAuthHandshakeGuard;
}
