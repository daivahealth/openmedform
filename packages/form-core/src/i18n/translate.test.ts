import { describe, it, expect } from 'vitest';
import { resolveTranslation, createTranslator, hasLanguage } from './translate';
import { rrtSbarReference } from '../fixtures/rrt-sbar.reference';

const bundle = rrtSbarReference.translations;

describe('resolveTranslation', () => {
  it('resolves the requested language', () => {
    expect(resolveTranslation(bundle, 'assessment.avpu.ALERT', 'en')).toBe('Alert');
    expect(resolveTranslation(bundle, 'assessment.avpu.ALERT', 'el')).toBe('Σε εγρήγορση');
  });

  it('falls back to the default language when the requested one is absent', () => {
    // 'fr' is not provided; default language is 'el'.
    expect(resolveTranslation(bundle, 'assessment.avpu.ALERT', 'fr')).toBe('Σε εγρήγορση');
  });

  it('falls back to the caller fallback, then the key, for unknown keys', () => {
    expect(resolveTranslation(bundle, 'missing.key', 'en', 'Default')).toBe('Default');
    expect(resolveTranslation(bundle, 'missing.key', 'en')).toBe('missing.key');
  });
});

describe('createTranslator / hasLanguage', () => {
  it('binds a language into a reusable function', () => {
    const t = createTranslator(bundle, 'en');
    expect(t('validation.required')).toBe('This field is required');
  });
  it('reports declared languages', () => {
    expect(hasLanguage(bundle, 'el')).toBe(true);
    expect(hasLanguage(bundle, 'de')).toBe(false);
  });
});
