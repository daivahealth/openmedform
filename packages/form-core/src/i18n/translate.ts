/**
 * i18n resolution over a TranslationBundle.
 *
 * Display strings are resolved by stable key; saved clinical data always uses
 * language-independent codes (see TranslationBundle docs) — translation is a
 * presentation concern only. Resolution falls back requested language →
 * default language → caller fallback → the key itself, so a missing string is
 * always visible rather than blank.
 *
 * Framework-independent: no rendering.
 */

import type { LanguageCode, TranslationBundle } from '@openmedform/form-schema-types';

export type Translator = (key: string, fallback?: string) => string;

/** Resolve one translation key for a language, with graceful fallback. */
export function resolveTranslation(
  bundle: TranslationBundle,
  key: string,
  language: LanguageCode,
  fallback?: string,
): string {
  const entry = bundle.entries[key];
  if (entry) {
    if (entry[language] !== undefined) return entry[language];
    if (entry[bundle.defaultLanguage] !== undefined) return entry[bundle.defaultLanguage];
  }
  return fallback ?? key;
}

/** Bind a bundle + language into a reusable translator function. */
export function createTranslator(
  bundle: TranslationBundle,
  language: LanguageCode,
): Translator {
  return (key, fallback) => resolveTranslation(bundle, key, language, fallback);
}

/** True when the bundle declares support for the given language. */
export function hasLanguage(bundle: TranslationBundle, language: LanguageCode): boolean {
  return bundle.languages.includes(language);
}
