/**
 * Alignment — which prior observations belong to which field of the
 * definition being rendered (ADR-005). This is the ONLY place the matching
 * rule lives; both renderers, the flowsheet and the API read model use it.
 *
 * The rule, in strict order:
 *
 * 1. Same terminology binding (`system` + `code`) on any coding of the field
 *    and any coding of the observation. Survives a field being renamed or
 *    moved between versions, and lines up the same reading across DIFFERENT
 *    forms (ward vitals vs ICU chart). This is the path we want customers on.
 * 2. Else the same index-free data path. Works across versions of one form
 *    while a field stays put and unbound; breaks the moment it moves.
 * 3. Else nothing.
 *
 * Never by label: two "Temperature" fields in °C and °F are not one series.
 * Units are compared nowhere here — a mismatch is the caller's to DISPLAY,
 * not ours to convert.
 */

import type {
  FormDefinitionSchemas,
  HistoryEntry,
  Observation,
  OmfCoding,
  UiSchema,
  UiSchemaElement,
} from '@openmedform/form-schema-types';
import { scopeToDataPath } from '../schema/pointer';
import { projectObservations } from './project';

/** One field of the current definition, as alignment sees it. */
export interface HistoryField {
  /** Index-free data path — the key of the alignment result. */
  key: string;
  /** JSON Forms scope of the Control (relative to its record's `items` when inside a recordTable). */
  scope: string;
  coding?: OmfCoding[];
  unit?: string;
  section?: string;
}

/**
 * The alignment key for a data path: numeric segments removed, so
 * `treatments.2.dose` and `treatments.dose` are the same field.
 */
export function historyKeyForPath(path: string): string {
  return path
    .split('.')
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment))
    .join('.');
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

function detailLayout(el: ElementWithScope): UiSchemaElement | undefined {
  const native = el.options?.detail;
  if (native && typeof native === 'object' && 'type' in (native as object)) return native as UiSchemaElement;
  const omf = readOmf(el).detail;
  if (omf && typeof omf === 'object' && 'type' in (omf as object)) return omf as UiSchemaElement;
  return undefined;
}

/**
 * Every Control of the definition that can carry history, including the
 * Controls inside a `recordTable`'s detail layout (keyed without indices).
 * Order follows the UI schema, which is the row order a flowsheet wants.
 */
export function collectHistoryFields(definition: FormDefinitionSchemas): HistoryField[] {
  const root = (((definition.uiSchema as UiSchema)?.layout ?? definition.uiSchema) ??
    {}) as UiSchemaElement;
  const fields: HistoryField[] = [];

  const walk = (el: UiSchemaElement, prefix: string, section: string | undefined): void => {
    const node = el as ElementWithScope;
    const nextSection =
      node.type === 'Group' && typeof node.label === 'string' ? node.label : section;

    if (node.type === 'Control' && typeof node.scope === 'string') {
      const local = scopeToDataPath(node.scope);
      const key = prefix ? `${prefix}.${local}` : local;
      const omf = readOmf(node);
      const coding = Array.isArray(omf.coding) && omf.coding.length > 0 ? (omf.coding as OmfCoding[]) : undefined;
      const unit = typeof omf.unit === 'string' ? omf.unit : undefined;
      fields.push({
        key,
        scope: node.scope,
        ...(coding ? { coding } : {}),
        ...(unit ? { unit } : {}),
        ...(nextSection ? { section: nextSection } : {}),
      });
      const detail = detailLayout(node);
      if (detail) walk(detail, key, nextSection);
    }

    for (const child of node.elements ?? []) walk(child, prefix, nextSection);
  };

  walk(root, '', undefined);
  return fields;
}

function sameCoding(a: OmfCoding, b: OmfCoding): boolean {
  return a.system === b.system && a.code === b.code;
}

function matchesByCoding(field: Pick<HistoryField, 'coding'>, observation: Observation): boolean {
  if (!field.coding || !observation.coding) return false;
  return field.coding.some((fc) => observation.coding!.some((oc) => sameCoding(fc, oc)));
}

function matchesByPath(field: Pick<HistoryField, 'key'>, observation: Observation): boolean {
  return historyKeyForPath(observation.path) === field.key;
}

/** True when the observation is a prior value of the field, by the ADR-005 rule. */
export function observationMatchesField(
  field: Pick<HistoryField, 'key' | 'coding'>,
  observation: Observation,
): boolean {
  return matchesByCoding(field, observation) || matchesByPath(field, observation);
}

/** Newest first; ties keep input order. */
export function sortNewestFirst(observations: Observation[]): Observation[] {
  return observations
    .map((o, i) => ({ o, i, t: Date.parse(o.effectiveAt) }))
    .sort((a, b) => (b.t || 0) - (a.t || 0) || a.i - b.i)
    .map((x) => x.o);
}

/**
 * Group prior observations under the fields of `definition`. Keys are
 * index-free data paths (see `historyKeyForPath`); a field with no matches is
 * present with an empty list so callers can tell "no history" from "not a
 * field". Each list is newest first.
 *
 * A coding match never falls through to a path match for the same observation,
 * so an observation whose code matches field A is not also attributed to
 * field B merely because B sits at the same path in an older version.
 */
export function alignHistory(
  definition: FormDefinitionSchemas,
  history: Observation[],
): Map<string, Observation[]> {
  const fields = collectHistoryFields(definition);
  const result = new Map<string, Observation[]>();
  for (const f of fields) result.set(f.key, []);

  for (const obs of history) {
    const byCode = fields.filter((f) => matchesByCoding(f, obs));
    const targets = byCode.length > 0 ? byCode : fields.filter((f) => matchesByPath(f, obs));
    for (const f of targets) result.get(f.key)!.push(obs);
  }

  for (const [key, list] of result) result.set(key, sortNewestFirst(list));
  return result;
}

/**
 * Batch convenience: project each prior fill against ITS definition (or the
 * current one when omitted), then align. This is what a renderer's `history`
 * prop goes through.
 */
export function alignHistoryEntries(
  definition: FormDefinitionSchemas,
  entries: HistoryEntry[],
): Map<string, Observation[]> {
  const observations: Observation[] = [];
  for (const entry of entries) {
    const source = {
      ...(entry.author ? { author: entry.author } : {}),
      ...(entry.source ?? {}),
    };
    observations.push(
      ...projectObservations(entry.definition ?? definition, entry.data, {
        effectiveAt: entry.effectiveAt,
        ...(Object.keys(source).length > 0 ? { source } : {}),
      }),
    );
  }
  return alignHistory(definition, observations);
}

/**
 * Merge lazily fetched observations into an aligned list. Provider results
 * win over batch results at the same `effectiveAt` (the host's store is the
 * authority), and the result is newest first.
 */
export function mergeHistory(batch: Observation[], fetched: Observation[]): Observation[] {
  const seen = new Set(fetched.map((o) => o.effectiveAt));
  return sortNewestFirst([...fetched, ...batch.filter((o) => !seen.has(o.effectiveAt))]);
}
