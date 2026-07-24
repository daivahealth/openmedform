/**
 * FormDefinition — a discriminated union on `engine`.
 *
 * - engine 'formio'    → a single coupled Form.io component tree (`schema`).
 * - engine 'jsonforms' → separated Data / UI / Print schemas + translations,
 *                        assets, and conversion metadata.
 *
 * A response is pinned to both the exact version AND the engine that produced it.
 */

import type { AuditMetadata, FormStatus, LanguageCode } from './common';
import type { JsonSchema } from './data-schema';
import type { UiSchema } from './ui-schema';
import type { PrintSchema } from './print-schema';
import type { TranslationBundle } from './translation';
import type { FormAssetReference } from './asset';
import type { ConversionMetadata } from './conversion';

export interface FormDefinitionBase {
  id: string;
  formCode: string;
  name: string;
  description?: string;
  version: string;
  language: LanguageCode;
  status: FormStatus;
  audit: AuditMetadata;
}

/** Form.io engine: the legacy coupled schema is preserved as-is. */
export interface FormioFormDefinition extends FormDefinitionBase {
  engine: 'formio';
  /** Form.io component tree ({ display, components[] }). */
  schema: Record<string, unknown>;
}

/** JSON Forms engine: data / UI / print concerns are separated. */
export interface JsonFormsFormDefinition extends FormDefinitionBase {
  engine: 'jsonforms';
  dataSchema: JsonSchema;
  uiSchema: UiSchema;
  printSchema: PrintSchema;
  translations: TranslationBundle;
  assets: FormAssetReference[];
  conversionMetadata?: ConversionMetadata;
}

export type FormDefinition = FormioFormDefinition | JsonFormsFormDefinition;

/** Narrowing helper for the jsonforms variant. */
export function isJsonFormsDefinition(
  def: FormDefinition,
): def is JsonFormsFormDefinition {
  return def.engine === 'jsonforms';
}

/** Narrowing helper for the formio variant. */
export function isFormioDefinition(
  def: FormDefinition,
): def is FormioFormDefinition {
  return def.engine === 'formio';
}
