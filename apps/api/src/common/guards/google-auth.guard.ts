import {
  BadRequestException,
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';
import { Request } from 'express';

/**
 * Guard for the Google OAuth2 handshake routes. Short-circuits with a clear
 * 503 when Google SSO env config is absent (e.g. local dev), since the
 * passport strategy itself is only registered when configured.
 */
@Injectable()
export class GoogleAuthGuard extends AuthGuard('google') {
  constructor(private readonly config: ConfigService) {
    super();
  }

  canActivate(context: ExecutionContext) {
    const clientId = this.config.get<string>('GOOGLE_CLIENT_ID');
    // 'CHANGE_ME' is the placeholder scripts/gcp-setup.sh seeds; treat it as
    // unconfigured so the button never sends users to Google with bad creds.
    if (!clientId || clientId === 'CHANGE_ME') {
      throw new ServiceUnavailableException(
        'Google SSO is not configured on this server',
      );
    }
    return super.canActivate(context);
  }

  /**
   * Carry the login/signup intent to Google via the OAuth `state` param, so the
   * callback (GoogleStrategy.validate) knows what to do. Signup requires the
   * organization name and country up front — they become the new tenant and
   * cannot be derived reliably from a Google profile, so the handshake is
   * rejected without them.
   *
   * Started from `GET /api/auth/google?mode=signup&org=...&country=...`;
   * anything else defaults to login. State is a base64url JSON payload; the
   * legacy plain 'signup'/'login' strings are still accepted by the strategy.
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
        throw new BadRequestException(
          'Organization or country is too long.',
        );
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
