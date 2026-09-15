/**
 * Flowsheet model — parameters down the left, one column per occurrence
 * across the top, newest first (ADR-005 §4). Built here so the React and
 * Angular `Flowsheet` components are thin renderers of one shared model and a
 * flowsheet from twelve separate responses looks the same as one from a single
 * recordTable-column form.
 */

import type { FormDefinitionSchemas, Observation } from '@openmedform/form-schema-types';
import { alignHistory, collectHistoryFields, historyKeyForPath, type HistoryField } from './align';
import { formatObservationValue, isSuperseded, observationAuthor } from './format';
import { hasMixedUnits } from './trend';

export interface FlowsheetColumn {
  effectiveAt: string;
  /** Distinct authors of the readings in this column, if the host attached any. */
  authors: string[];
}

export interface FlowsheetCell {
  /** Current readings for this field at this time, newest first. Usually one. */
  observations: Observation[];
  /** Readings the host marked superseded (a correction replaced them). */
  superseded: Observation[];
  /** Display text of `observations`, joined — '' when empty. */
  text: string;
}

export interface FlowsheetRow {
  key: string;
  label: string;
  /** The current definition's unit for the field, if declared. */
  unit?: string;
  /** Readings in this row carry more than one unit — cells then show units individually. */
  mixedUnits: boolean;
  field: HistoryField;
  /** One cell per column, same order as `columns`. */
  cells: FlowsheetCell[];
}

export interface FlowsheetSection {
  label?: string;
  rows: FlowsheetRow[];
}

export interface Flowsheet {
  columns: FlowsheetColumn[];
  sections: FlowsheetSection[];
}

export interface BuildFlowsheetOptions {
  /** Cap on columns (newest kept). Default: all. */
  maxColumns?: number;
  /** Keep rows for fields with no readings at all (default false). */
  includeEmptyRows?: boolean;
}

function labelFor(field: HistoryField, observations: Observation[]): string {
  // Prefer the label of the most recent reading taken at THIS field's path
  // (i.e. against the current definition), else any reading's label, else
  // the key's last segment.
  const samePath = observations.find((o) => historyKeyForPath(o.path) === field.key);
  const fromObs = (samePath ?? observations[0])?.label;
  return fromObs ?? field.key.split('.').pop() ?? field.key;
}

export function buildFlowsheet(
  definition: FormDefinitionSchemas,
  observations: Observation[],
  opts: BuildFlowsheetOptions = {},
): Flowsheet {
  const fields = collectHistoryFields(definition);
  const aligned = alignHistory(definition, observations);

  // Columns: every distinct effectiveAt that has at least one aligned reading.
  const times = new Map<string, Set<string>>();
  for (const list of aligned.values()) {
    for (const o of list) {
      if (!times.has(o.effectiveAt)) times.set(o.effectiveAt, new Set());
      const a = observationAuthor(o);
      if (a) times.get(o.effectiveAt)!.add(a);
    }
  }
  let columns: FlowsheetColumn[] = [...times.entries()]
    .map(([effectiveAt, authors]) => ({ effectiveAt, authors: [...authors].sort(), t: Date.parse(effectiveAt) }))
    .sort((a, b) => (b.t || 0) - (a.t || 0))
    .map(({ effectiveAt, authors }) => ({ effectiveAt, authors }));
  if (opts.maxColumns !== undefined) columns = columns.slice(0, Math.max(0, opts.maxColumns));
  const columnSet = new Set(columns.map((c) => c.effectiveAt));

  const sections: FlowsheetSection[] = [];
  let current: FlowsheetSection | undefined;

  for (const field of fields) {
    const list = (aligned.get(field.key) ?? []).filter((o) => columnSet.has(o.effectiveAt));
    if (list.length === 0 && !opts.includeEmptyRows) continue;
    // A recordTable container itself (array value) never has scalar readings; skip.
    const mixedUnits = hasMixedUnits(list.filter((o) => !isSuperseded(o)));
    const cells: FlowsheetCell[] = columns.map((col) => {
      const at = list.filter((o) => o.effectiveAt === col.effectiveAt);
      const live = at.filter((o) => !isSuperseded(o));
      const superseded = at.filter(isSuperseded);
      return {
        observations: live,
        superseded,
        text: live.map((o) => formatObservationValue(o, { unit: mixedUnits })).join(', '),
      };
    });
    const row: FlowsheetRow = {
      key: field.key,
      label: labelFor(field, list),
      ...(field.unit ? { unit: field.unit } : {}),
      mixedUnits,
      field,
      cells,
    };
    if (!current || current.label !== field.section) {
      current = { ...(field.section ? { label: field.section } : {}), rows: [] };
      sections.push(current);
    }
    current.rows.push(row);
  }

  return { columns, sections };
}
