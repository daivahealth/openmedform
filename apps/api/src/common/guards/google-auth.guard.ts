import { createOAuthHandshakeGuard } from './oauth-handshake.guard';

/**
 * Starts the Google OAuth2 handshake. All the behaviour lives in the shared
 * factory — see oauth-handshake.guard.ts for why.
 */
export const GoogleAuthGuard = createOAuthHandshakeGuard({
  strategy: 'google',
  clientIdEnv: 'GOOGLE_CLIENT_ID',
  displayName: 'Google',
});
