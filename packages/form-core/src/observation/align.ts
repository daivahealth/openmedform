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
  JsonSchema,
  Observation,
  OmfCoding,
  OmfHistoryOptions,
  UiSchema,
  UiSchemaElement,
} from '@openmedform/form-schema-types';
import { resolveSchemaAtScope, scopeToDataPath } from '../schema/pointer';
import { projectObservations } from './project';

/** One field of the current definition, as alignment sees it. */
export interface HistoryField {
  /** Index-free data path — the key of the alignment result. */
  key: string;
  /** JSON Forms scope of the Control (relative to its record's `items` when inside a recordTable). */
  scope: string;
  /** Display label, resolved as the renderer does: element label, schema title, then the key. */
  label: string;
  coding?: OmfCoding[];
  unit?: string;
  section?: string;
  /**
   * The EFFECTIVE history setting after inheritance (ADR-006): the Control's
   * own `omf.history`, else the nearest enclosing section's. Absent when
   * neither declares one, or when the control cannot carry a reading.
   */
  history?: OmfHistoryOptions;
  /** True when `history` came from an enclosing section rather than the field itself. */
  historyInherited?: boolean;
}

/**
 * omf custom controls that hold a scalar reading and so may inherit a section's
 * history. Every other `omf.control` (matrices, charts, summaries, signature,
 * the recordTable container itself) is layout or display and never does; it
 * may still opt in explicitly with its own `omf.history`.
 */
const READING_CONTROLS = new Set(['textarea', 'radio', 'checkboxGroup']);

function readHistory(omf: Record<string, unknown>): OmfHistoryOptions | undefined {
  const h = omf.history;
  return h && typeof h === 'object' && typeof (h as OmfHistoryOptions).show === 'string'
    ? (h as OmfHistoryOptions)
    : undefined;
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

/** One Control per property — what a detail-less repeating group renders as. */
function generatedDetail(items: JsonSchema): UiSchemaElement {
  return {
    type: 'VerticalLayout',
    elements: Object.keys(items.properties ?? {}).map((k) => ({ type: 'Control', scope: `#/properties/${k}` })),
  } as unknown as UiSchemaElement;
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

  const walk = (
    el: UiSchemaElement,
    prefix: string,
    schemaRoot: JsonSchema,
    section: string | undefined,
    inherited: OmfHistoryOptions | undefined,
  ): void => {
    const node = el as ElementWithScope;
    const nextSection =
      node.type === 'Group' && typeof node.label === 'string' ? node.label : section;
    const omf = readOmf(node);
    const isControl = node.type === 'Control' && typeof node.scope === 'string';
    // Any non-Control element that declares history is a section default for
    // everything beneath it; the nearest one wins (ADR-006).
    const nextInherited = !isControl ? (readHistory(omf) ?? inherited) : inherited;

    if (isControl) {
      const scope = node.scope as string;
      const local = scopeToDataPath(scope);
      const key = prefix ? `${prefix}.${local}` : local;
      const schema = resolveSchemaAtScope(schemaRoot, scope);
      const label =
        (typeof node.label === 'string' && node.label) || schema?.title || local.split('.').pop() || local;
      const coding = Array.isArray(omf.coding) && omf.coding.length > 0 ? (omf.coding as OmfCoding[]) : undefined;
      const unit = typeof omf.unit === 'string' ? omf.unit : undefined;
      const own = readHistory(omf);
      const control = typeof omf.control === 'string' ? omf.control : undefined;
      const canInherit = control === undefined || READING_CONTROLS.has(control);
      const history = own ?? (canInherit ? inherited : undefined);
      fields.push({
        key,
        scope,
        label,
        ...(coding ? { coding } : {}),
        ...(unit ? { unit } : {}),
        ...(nextSection ? { section: nextSection } : {}),
        ...(history ? { history, historyInherited: !own } : {}),
      });
      // A repeating group: walk its per-record layout so record fields are
      // fields too. Without an authored detail layout, derive one from the
      // items schema — the same degrade path projection takes, so a reading
      // projected from a bare array still finds its row here.
      const rawItems = schema?.items;
      const items = (Array.isArray(rawItems) ? rawItems[0] : rawItems) as JsonSchema | undefined;
      const detail = detailLayout(node) ?? (items?.properties ? generatedDetail(items) : undefined);
      if (detail) {
        // The table's own history (or its section's) is the default for the fields of each record.
        walk(detail, key, (items ?? {}) as JsonSchema, nextSection, own ?? inherited);
      }
    }

    for (const child of node.elements ?? []) walk(child, prefix, schemaRoot, nextSection, nextInherited);
  };

  walk(root, '', (definition.dataSchema ?? {}) as JsonSchema, undefined, undefined);
  return fields;
}

/**
 * The effective history setting of every field that has one, keyed by
 * index-free data path — what a renderer's history scope hands its controls
 * so a section-level `omf.history` reaches them without each control having
 * to know its ancestors (ADR-006). Fields with `show: 'none'` are included so
 * an explicit opt-out is distinguishable from "nothing declared".
 */
export function resolveHistoryConfig(definition: FormDefinitionSchemas): Map<string, OmfHistoryOptions> {
  const out = new Map<string, OmfHistoryOptions>();
  for (const f of collectHistoryFields(definition)) {
    if (f.history) out.set(f.key, f.history);
  }
  return out;
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
