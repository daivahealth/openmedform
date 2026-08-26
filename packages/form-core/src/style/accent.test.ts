import { describe, it, expect } from 'vitest';
import { accentTint, accentTintOpaque, parseHexColor } from './accent';

describe('parseHexColor', () => {
  it('reads both hex lengths, with or without the hash', () => {
    expect(parseHexColor('#b3392c')).toEqual([179, 57, 44]);
    expect(parseHexColor('b3392c')).toEqual([179, 57, 44]);
    expect(parseHexColor('#f00')).toEqual([255, 0, 0]);
  });

  it('returns undefined for a colour it cannot read, rather than guessing', () => {
    // A definition may legitimately carry these; the caller keeps the accent
    // for borders and text and simply goes without the derived tint.
    for (const c of ['var(--bad)', 'rgb(1,2,3)', 'red', '#12345', '', undefined]) {
      expect(parseHexColor(c as string)).toBeUndefined();
    }
  });
});

describe('accentTint', () => {
  it('washes the accent for a callout background', () => {
    expect(accentTint('#b3392c')).toBe('rgba(179, 57, 44, 0.08)');
    expect(accentTint('#b3392c', 0.2)).toBe('rgba(179, 57, 44, 0.2)');
  });

  it('is undefined when the accent is not hex', () => {
    expect(accentTint('var(--bad)')).toBeUndefined();
  });
});

describe('accentTintOpaque', () => {
  it('mixes against white so print pipelines that drop alpha keep the tint', () => {
    // Same visual result as the rgba wash, with no transparency involved.
    expect(accentTintOpaque('#b3392c')).toBe('rgb(249, 239, 238)');
    expect(accentTintOpaque('#ffffff')).toBe('rgb(255, 255, 255)');
  });

  it('darkens further as alpha rises', () => {
    expect(accentTintOpaque('#000000', 0.5)).toBe('rgb(128, 128, 128)');
  });
});
