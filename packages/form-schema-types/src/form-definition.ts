/**
 * FormDefinition — separated Data / UI / Print schemas plus translations,
 * assets and conversion metadata.
 *
 * A response is pinned to the exact version that produced it.
 *
 * BREAKING (v1.0.0): this used to be a discriminated union on `engine`, with a
 * second `'formio'` variant carrying a single coupled component tree. The
 * Form.io engine was removed (ADR-004), so the union, the `engine`
 * discriminator and the `isFormioDefinition` / `isJsonFormsDefinition`
 * narrowing helpers are gone. `JsonFormsFormDefinition` remains as an alias of
 * `FormDefinition` so existing imports keep resolving.
 */

import type { AuditMetadata, FormStatus, LanguageCode } from './common';
import type { JsonSchema } from './data-schema';
import type { UiSchema } from './ui-schema';
import type { PrintSchema } from './print-schema';
import type { TranslationBundle } from './translation';
import type { FormAssetReference } from './asset';
import type { ConversionMetadata } from './conversion';

export interface FormDefinition {
  id: string;
  formCode: string;
  name: string;
  description?: string;
  version: string;
  language: LanguageCode;
  status: FormStatus;
  audit: AuditMetadata;
  dataSchema: JsonSchema;
  uiSchema: UiSchema;
  printSchema: PrintSchema;
  translations: TranslationBundle;
  assets: FormAssetReference[];
  conversionMetadata?: ConversionMetadata;
}

/**
 * Alias kept so code and docs that spelled out the engine still compile. There
 * is only one kind of form definition now.
 */
export type JsonFormsFormDefinition = FormDefinition;
