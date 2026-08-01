'use client';

import { JsonFormsRenderer } from '@openmedform/react-form-renderer';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';

/** A form version as returned by the API. */
export interface ApiVersion {
  version?: number;
  engine?: string;
  dataSchema?: unknown;
  uiSchema?: unknown;
  printSchema?: unknown;
  translations?: unknown;
  conversionMetadata?: unknown;
}
export interface ApiForm {
  id: string;
  slug?: string;
  name: string;
  status?: string;
  currentVersion?: ApiVersion | null;
  versions?: ApiVersion[];
}

interface Props {
  form: ApiForm;
  version?: ApiVersion;
  data?: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: (data: Record<string, unknown>) => void;
}

const FALLBACK_UI = { schemaVersion: '1.0', layout: { type: 'VerticalLayout', elements: [] } };
const FALLBACK_PRINT = {
  schemaVersion: '1.0',
  pageSize: 'A4',
  orientation: 'portrait',
  marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
};
const FALLBACK_TRANSLATIONS = { defaultLanguage: 'en', languages: ['en'], entries: {} };

/**
 * Assemble a jsonforms FormDefinition from the API form shape. Shared by the
 * on-screen renderer and the print-preview path so both consume identical
 * schemas (single source of truth for fallbacks).
 */
export function toJsonFormsDefinition(
  form: ApiForm,
  version?: ApiVersion,
): JsonFormsFormDefinition {
  const v = version ?? form.currentVersion ?? form.versions?.[0];

  return {
    id: form.id,
    formCode: form.slug ?? form.id,
    name: form.name,
    version: String(v?.version ?? '1'),
    language:
      (v?.translations as { defaultLanguage?: string } | undefined)?.defaultLanguage ?? 'en',
    status: (form.status ?? 'DRAFT') as JsonFormsFormDefinition['status'],
    dataSchema: (v?.dataSchema ?? {}) as JsonFormsFormDefinition['dataSchema'],
    uiSchema: (v?.uiSchema ?? FALLBACK_UI) as JsonFormsFormDefinition['uiSchema'],
    printSchema: (v?.printSchema ?? FALLBACK_PRINT) as JsonFormsFormDefinition['printSchema'],
    translations: (v?.translations ?? FALLBACK_TRANSLATIONS) as JsonFormsFormDefinition['translations'],
    assets: [],
    conversionMetadata: v?.conversionMetadata as JsonFormsFormDefinition['conversionMetadata'],
    audit: { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
  } satisfies JsonFormsFormDefinition;
}

/**
 * Renders a form from the API shape by assembling a FormDefinition and
 * delegating to the shared React renderer.
 */
export function JsonFormsRendererWrapper({ form, version, data, readOnly, onChange }: Props) {
  const definition = toJsonFormsDefinition(form, version);

  return (
    <JsonFormsRenderer
      definition={definition}
      data={data}
      readOnly={readOnly}
      onChange={onChange}
    />
  );
}
