import { ServiceUnavailableException } from '@nestjs/common';
import type { ConfigService } from '@nestjs/config';
import type { ExecutionContext } from '@nestjs/common';
import { describe, expect, it } from 'vitest';

import { createOAuthHandshakeGuard } from './oauth-handshake.guard';

function guardWithClientId(clientId: string | undefined) {
  const Guard = createOAuthHandshakeGuard({
    strategy: 'microsoft',
    clientIdEnv: 'MICROSOFT_CLIENT_ID',
    displayName: 'Microsoft',
  });
  const config = { get: () => clientId } as unknown as ConfigService;
  return new Guard(config);
}

const context = {
  switchToHttp: () => ({ getRequest: () => ({ query: {} }) }),
} as unknown as ExecutionContext;

describe('createOAuthHandshakeGuard', () => {
  it('refuses the handshake when the client id is a placeholder', () => {
    // The whole point: a placeholder must not reach the identity provider,
    // where it comes back as an error about the *user's* input.
    for (const placeholder of [
      undefined,
      '',
      'CHANGE_ME',
      '<Application (client) ID from step 1>',
    ]) {
      expect(() => guardWithClientId(placeholder).canActivate(context)).toThrow(
        ServiceUnavailableException,
      );
    }
  });

  it('names the provider so the operator knows which one is off', () => {
    expect(() => guardWithClientId('CHANGE_ME').canActivate(context)).toThrow(
      /Microsoft sign-in is not configured/,
    );
  });

  it('does not refuse a real client id', async () => {
    // Reaching super.canActivate is the pass condition. Passport is not
    // registered in a unit test so it fails there — awaited and caught, both
    // to inspect what came back and to keep the rejection from escaping.
    const guard = guardWithClientId('3f2b8c1a-7d4e-4a91-b0c5-1e6f8a2d9b47');

    let outcome: unknown;
    try {
      outcome = await guard.canActivate(context);
    } catch (err) {
      outcome = err;
    }

    expect(outcome).not.toBeInstanceOf(ServiceUnavailableException);
  });
});
