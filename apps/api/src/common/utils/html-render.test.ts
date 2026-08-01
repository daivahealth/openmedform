/**
 * Availability and fallback behaviour of the sandboxed renderer.
 *
 * The rendering itself needs a real Chromium, which CI does not install, so
 * these cover the contract every caller depends on: rendering is OPTIONAL, and
 * anything going wrong must yield null rather than throw. The live behaviour
 * (a script-built form recovered, network blocked, runaway script timed out)
 * is verified manually against a real browser — see docs/features/PDF-TO-FORM.md.
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  isHtmlRenderEnabled,
  renderHtmlToDom,
  renderHtmlToDomWithOutcome,
} from './html-render';

const original = { ...process.env };
afterEach(() => {
  process.env = { ...original };
});

describe('isHtmlRenderEnabled', () => {
  it('is on by default', () => {
    delete process.env.HTML_RENDER_DISABLED;
    expect(isHtmlRenderEnabled()).toBe(true);
  });

  it('is off when HTML_RENDER_DISABLED=1', () => {
    process.env.HTML_RENDER_DISABLED = '1';
    expect(isHtmlRenderEnabled()).toBe(false);
  });

  it('treats any other value as on, so a stray "0" does not silently disable it', () => {
    process.env.HTML_RENDER_DISABLED = '0';
    expect(isHtmlRenderEnabled()).toBe(true);
  });
});

describe('renderHtmlToDom', () => {
  it('returns null without launching a browser when disabled', async () => {
    process.env.HTML_RENDER_DISABLED = '1';
    await expect(renderHtmlToDom('<input name="a">')).resolves.toBeNull();
  });

  it('returns null rather than throwing when no browser is installed', async () => {
    delete process.env.HTML_RENDER_DISABLED;
    process.env.CHROMIUM_PATH = '/nonexistent/chromium-does-not-exist';
    // Callers treat null as "use the static markup"; a throw would fail the
    // whole conversion on a deployment that simply has no Chromium.
    await expect(renderHtmlToDom('<input name="a">')).resolves.toBeNull();
  });
});

describe('renderHtmlToDomWithOutcome', () => {
  it('reports "disabled" rather than a generic failure', async () => {
    process.env.HTML_RENDER_DISABLED = '1';
    await expect(renderHtmlToDomWithOutcome('<input>')).resolves.toEqual({ status: 'disabled' });
  });

  it('reports "unavailable" with a reason when no browser can be launched', async () => {
    delete process.env.HTML_RENDER_DISABLED;
    process.env.CHROMIUM_PATH = '/nonexistent/chromium-does-not-exist';
    const outcome = await renderHtmlToDomWithOutcome('<input>');
    // The caller turns this into "this deployment has no browser", which is an
    // operator problem — distinct from "your file builds nothing".
    expect(outcome.status).toBe('unavailable');
    expect(outcome).toHaveProperty('detail');
  });
});
