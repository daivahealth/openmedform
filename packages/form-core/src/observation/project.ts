/**
 * Projection — flatten one response into `Observation` rows (ADR-005).
 *
 * Walks the UI schema (the same walk the dictionary and scoring use, because
 * bindings live on UI elements and the UI schema is what defines which fields
 * exist) and emits one row per scalar value found in the response:
 *
 * - a plain Control → one row, carrying the field's `omf.coding` and `omf.unit`;
 * - a single-select → one row whose value is the stored code, plus the option's
 *   label and `omf.optionCoding` so a host never has to re-derive them;
 * - a multi-select (array of codes) → one row PER selected option;
 * - a `recordTable` (array of objects) → the per-record detail layout is walked
 *   for every record, paths carry the record index, and each record may take
 *   its own timestamp from `recordTable.effectiveAtPath`.
 *
 * Empty values (undefined, null, '') produce nothing: an unanswered question is
 * not an observation.
 *
 * Framework-independent and I/O-free. Hosts call this at save time to fill an
 * observation store; the renderers call it to align batch history; the API
 * calls it to populate its read model. One walker, so none of them drift.
 */

import type {
  FormDefinitionSchemas,
  JsonSchema,
  Observation,
  ObservationValue,
  OmfCoding,
  UiSchema,
  UiSchemaElement,
} from '@openmedform/form-schema-types';
import { resolveSchemaAtScope, scopeToDataPath } from '../schema/pointer';
import { resolveEnumOptions, resolveMultiEnumOptions } from '../schema/enum-options';
import { getValueAtPath } from '../binding/data-path';

export interface ProjectContext {
  /** Clinical time of the response as a whole, ISO-8601. */
  effectiveAt: string;
  /** Copied onto every row's `source` (form code/version, author, …). */
  source?: Record<string, unknown>;
}

type ElementWithScope = UiSchemaElement & {
  scope?: string;
  label?: unknown;
  elements?: UiSchemaElement[];
  options?: { detail?: unknown; omf?: Record<string, unknown> };
};

function readOmf(el: UiSchemaElement): Record<string, unknown> {
  return ((el as ElementWithScope).options?.omf ?? {}) as Record<string, unknown>;
}

function codingList(value: unknown): OmfCoding[] | undefined {
  return Array.isArray(value) && value.length > 0 ? (value as OmfCoding[]) : undefined;
}

function isScalar(value: unknown): value is ObservationValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/** Resolve a label the way the renderer does: element label, schema title, then the key. */
function resolveLabel(el: ElementWithScope, schema: JsonSchema | undefined, path: string): string {
  return (
    (typeof el.label === 'string' && el.label) ||
    schema?.title ||
    path.split('.').pop() ||
    path
  );
}

/**
 * The per-record UI schema of a `recordTable`: `options.detail` (JSON Forms
 * native), or `options.omf.detail` (what converted forms have carried).
 * Undefined when the author supplied neither — the caller then walks the
 * record's `items.properties` directly so nothing is silently dropped.
 */
function recordDetailLayout(el: ElementWithScope): UiSchemaElement | undefined {
  const native = el.options?.detail;
  if (native && typeof native === 'object' && 'type' in (native as object)) {
    return native as UiSchemaElement;
  }
  const omf = readOmf(el).detail;
  if (omf && typeof omf === 'object' && 'type' in (omf as object)) {
    return omf as UiSchemaElement;
  }
  return undefined;
}

/** A flat VerticalLayout of one Control per property — the degrade path for a detail-less record. */
function generatedDetailLayout(items: JsonSchema | undefined): UiSchemaElement {
  const elements = Object.keys(items?.properties ?? {}).map((key) => ({
    type: 'Control',
    scope: `#/properties/${key}`,
  }));
  return { type: 'VerticalLayout', elements } as unknown as UiSchemaElement;
}

function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

interface Frame {
  /** The schema the current layout's scopes resolve against (root, or a record's `items`). */
  schemaRoot: JsonSchema;
  /** The response object the current layout's paths read from. */
  data: unknown;
  /** Dotted prefix to prepend to emitted paths (`treatments.2`), or ''. */
  pathPrefix: string;
  effectiveAt: string;
}

/**
 * Flatten `data` (a response filled against `definition`) into observations.
 */
export function projectObservations(
  definition: FormDefinitionSchemas,
  data: Record<string, unknown> | undefined | null,
  ctx: ProjectContext,
): Observation[] {
  const rows: Observation[] = [];
  const uiRoot = (((definition.uiSchema as UiSchema)?.layout ?? definition.uiSchema) ??
    {}) as UiSchemaElement;
  const rootFrame: Frame = {
    schemaRoot: (definition.dataSchema ?? {}) as JsonSchema,
    data: data ?? {},
    pathPrefix: '',
    effectiveAt: ctx.effectiveAt,
  };

  const emit = (row: Omit<Observation, 'source'>): void => {
    rows.push(ctx.source ? { ...row, source: ctx.source } : row);
  };

  const walk = (el: UiSchemaElement, frame: Frame, section: string | undefined): void => {
    const node = el as ElementWithScope;
    const nextSection =
      node.type === 'Group' && typeof node.label === 'string' ? node.label : section;

    if (node.type === 'Control' && typeof node.scope === 'string') {
      visitControl(node, frame, nextSection);
    }

    for (const child of node.elements ?? []) {
      walk(child, frame, nextSection);
    }
  };

  const visitControl = (el: ElementWithScope, frame: Frame, section: string | undefined): void => {
    const scope = el.scope as string;
    const localPath = scopeToDataPath(scope);
    const path = frame.pathPrefix ? `${frame.pathPrefix}.${localPath}` : localPath;
    const schema = resolveSchemaAtScope(frame.schemaRoot, scope);
    const value = getValueAtPath(frame.data, localPath);
    if (isEmpty(value)) return;

    const omf = readOmf(el);
    const label = resolveLabel(el, schema, localPath);
    const coding = codingList(omf.coding);
    const unit = typeof omf.unit === 'string' ? omf.unit : undefined;
    const optionCoding = (omf.optionCoding ?? {}) as Record<string, unknown>;
    const base = { label, ...(section ? { section } : {}), ...(coding ? { coding } : {}) };

    // Repeating group: an array of objects. Each record is its own frame.
    if (Array.isArray(value) && value.some((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      const items = schema?.items;
      const detail = recordDetailLayout(el) ?? generatedDetailLayout(items);
      const recordTable = (omf.recordTable ?? {}) as { effectiveAtPath?: string };
      value.forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const own = recordTable.effectiveAtPath
          ? isoOrUndefined(getValueAtPath(record, recordTable.effectiveAtPath))
          : undefined;
        walk(
          detail,
          {
            schemaRoot: (items ?? {}) as JsonSchema,
            data: record,
            pathPrefix: `${path}.${index}`,
            effectiveAt: own ?? frame.effectiveAt,
          },
          section,
        );
      });
      return;
    }

    // Multi-select: one row per selected option.
    if (Array.isArray(value)) {
      const options = resolveMultiEnumOptions(schema, el as never);
      for (const item of value) {
        if (!isScalar(item) || isEmpty(item)) continue;
        const code = String(item);
        const option = options.find((o) => o.code === code);
        const valueCoding = codingList(optionCoding[code]);
        emit({
          ...base,
          path,
          value: item,
          ...(option ? { valueLabel: option.label } : {}),
          ...(valueCoding ? { valueCoding } : {}),
          effectiveAt: frame.effectiveAt,
        });
      }
      return;
    }

    if (!isScalar(value)) return; // a nested object without its own Controls — nothing to say

    // Single-select: keep the code, attach the option's label and binding.
    const options = resolveEnumOptions(schema, el as never);
    if (options.length > 0) {
      const code = String(value);
      const option = options.find((o) => o.code === code);
      const valueCoding = codingList(optionCoding[code]);
      emit({
        ...base,
        path,
        value,
        ...(option ? { valueLabel: option.label } : {}),
        ...(valueCoding ? { valueCoding } : {}),
        effectiveAt: frame.effectiveAt,
      });
      return;
    }

    emit({
      ...base,
      path,
      value,
      ...(unit ? { unit } : {}),
      effectiveAt: frame.effectiveAt,
    });
  };

  walk(uiRoot, rootFrame, undefined);
  return rows;
}
