import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { tokens } from './tokens';
import { cssVariables, toCssText } from './css';

describe('design tokens', () => {
  it('exposes the 12-column grid the omf.screen.colSpan range assumes', () => {
    expect(tokens.grid.columns).toBe(12);
  });

  it('projects every token group into --omf-* custom properties', () => {
    expect(cssVariables['--omf-font-size-body']).toBe('14px');
    expect(cssVariables['--omf-row-min-height']).toBe('36px');
    expect(cssVariables['--omf-color-border']).toBe(tokens.color.border);
    // all variables are namespaced to avoid collisions
    for (const name of Object.keys(cssVariables)) {
      expect(name.startsWith('--omf-')).toBe(true);
    }
  });

  it('keeps tokens.css in sync with the generated CSS (no drift)', () => {
    const here = dirname(fileURLToPath(import.meta.url));
    const fileContent = readFileSync(join(here, 'tokens.css'), 'utf8');
    expect(fileContent).toBe(toCssText());
  });
});
