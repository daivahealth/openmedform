/**
 * Translation bundle. Saved data always uses stable, language-independent codes
 * (e.g. enum value 'AWAKE_ORIENTED'); translated strings are display-only and
 * are NEVER persisted as clinical response values.
 */

import type { LanguageCode } from './common';

/** One translation key resolved across languages, e.g. { en: 'Awake', el: 'Ξύπνιος' }. */
export type TranslationEntry = Record<LanguageCode, string>;

export interface TranslationBundle {
  defaultLanguage: LanguageCode;
  languages: LanguageCode[];
  /**
   * Keyed by a stable translation key — form title, section headings, field
   * labels, help text, enum value codes, validation messages, buttons, warnings.
   */
  entries: Record<string, TranslationEntry>;
}
