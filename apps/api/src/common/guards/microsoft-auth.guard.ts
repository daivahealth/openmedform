import { createOAuthHandshakeGuard } from './oauth-handshake.guard';

/** Starts the Microsoft (Entra ID) OAuth2 handshake. */
export const MicrosoftAuthGuard = createOAuthHandshakeGuard({
  strategy: 'microsoft',
  clientIdEnv: 'MICROSOFT_CLIENT_ID',
  displayName: 'Microsoft',
});
