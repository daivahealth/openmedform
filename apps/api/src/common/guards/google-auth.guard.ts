import {
  ExecutionContext,
  Injectable,
  ServiceUnavailableException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AuthGuard } from '@nestjs/passport';

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
}
