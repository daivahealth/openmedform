import { describe, expect, it, vi } from 'vitest';
import { FormController } from './form.controller';
import type { RequestUser } from '../../common/types/jwt-payload.interface';

const user: RequestUser = {
  userId: '10000000-0000-0000-0000-000000000001',
  tenantId: '20000000-0000-0000-0000-000000000002',
  email: 'user@example.com',
  role: 'FORM_DESIGNER',
};

const FORM_ID = '30000000-0000-0000-0000-000000000003';
const ASSET_ID = '40000000-0000-0000-0000-000000000004';

/**
 * Uploaded asset bytes are attacker-supplied, and an SVG is an active document:
 * served inline, its <script> runs on the API origin. Verified in a real
 * browser — inline executes, attachment does not, and <img src> embedding never
 * did. These pin the headers that make that true.
 */
function serve(mimeType: string, filename: string) {
  const headers: Record<string, string> = {};
  const res = {
    setHeader: vi.fn((k: string, v: string) => {
      headers[k] = v;
    }),
    send: vi.fn(),
  };
  const formService = {
    getAsset: vi.fn().mockResolvedValue({ mimeType, filename, data: Buffer.from('x') }),
  };
  const controller = new FormController(formService as never, {} as never);
  return { controller, res, headers };
}

describe('asset download headers', () => {
  it('forces a download for SVG, so a direct navigation cannot become a document', async () => {
    const { controller, res, headers } = serve('image/svg+xml', 'logo.svg');

    await controller.getAsset(user, FORM_ID, ASSET_ID, res as never);

    expect(headers['Content-Disposition']).toMatch(/^attachment;/);
    expect(headers['Content-Type']).toBe('image/svg+xml');
  });

  it('still serves raster images inline', async () => {
    // Nothing is gained by downgrading these: a PNG cannot carry script.
    for (const type of ['image/png', 'image/jpeg', 'image/webp', 'image/gif']) {
      const { controller, res, headers } = serve(type, 'x');
      await controller.getAsset(user, FORM_ID, ASSET_ID, res as never);
      expect(headers['Content-Disposition']).toMatch(/^inline;/);
    }
  });

  it('sets nosniff and a no-permissions CSP on every asset', async () => {
    for (const type of ['image/svg+xml', 'image/png', 'application/pdf']) {
      const { controller, res, headers } = serve(type, 'x');
      await controller.getAsset(user, FORM_ID, ASSET_ID, res as never);

      // nosniff stops a mislabelled file being re-guessed as HTML; the CSP
      // applies if a browser renders it as a document anyway.
      expect(headers['X-Content-Type-Options']).toBe('nosniff');
      expect(headers['Content-Security-Policy']).toBe("default-src 'none'; sandbox");
    }
  });

  it('escapes the filename rather than reflecting it into the header', async () => {
    const { controller, res, headers } = serve('image/png', 'a"; attachment; x="b.png');

    await controller.getAsset(user, FORM_ID, ASSET_ID, res as never);

    expect(headers['Content-Disposition']).not.toContain('"; attachment');
    expect(headers['Content-Disposition']).toContain('%22');
  });
});
