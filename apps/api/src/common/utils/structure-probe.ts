/**
 * Turn a vision model's structure-probe reply into the same hints the HTML
 * detectors produce.
 *
 * WHY THIS EXISTS — `findRepeatingTables` and `findTransposedMatrices` walk
 * markup, and `layout-detect` clusters rendered geometry. A PDF or image has
 * neither: no DOM to parse, no browser to render it in. Those uploads have been
 * converting on prompt rules alone, which is why a scanned matrix chart lands
 * less reliably than the same form as HTML.
 *
 * So the page is asked directly — one narrow question, answered before the main
 * conversion (see structure-probe-prompt.ts). This module is the gate between
 * that answer and the rest of the pipeline.
 *
 * THE REPLY IS NOT TRUSTED. It is model output derived from a document the
 * uploader supplied, so it gets the same treatment as any other untrusted
 * source: parsed defensively, validated field by field, capped, and dropped
 * whole when it does not fit the shape. A hint is an instruction to the main
 * conversion, and a malformed or hallucinated one is worse than no hint at all
 * — it would confidently steer the model wrong. Everything here is therefore
 * biased towards discarding.
 *
 * Pure and synchronous: no I/O, no provider, so the validation can be tested
 * against hostile replies without an LLM.
 */

import type { RepeatingTableHint, TransposedMatrixHint } from './html-extract';

export interface ProbedStructures {
  repeatingTables: RepeatingTableHint[];
  transposedMatrices: TransposedMatrixHint[];
  /** Human-facing notes about what was rejected and why. */
  warnings: string[];
}

/** Tables accepted from one reply. A real form has a handful, not fifty. */
const MAX_TABLES = 8;
/** Labels in one table. Above this it is not a form, it is a data dump. */
const MAX_LABELS = 120;
/** Characters in one label. Real column headings are short. */
const MAX_LABEL_LENGTH = 160;
/** A matrix needs this many rows before it is a matrix rather than a stray pair. */
const MIN_MATRIX_ROWS = 3;
/** A log needs at least this many columns to be worth hinting. */
const MIN_LOG_COLUMNS = 2;
/**
 * Below this the model told us it was unsure. An uncertain hint is worse than
 * none, because the main conversion treats hints as fact.
 */
const MIN_CONFIDENCE = 0.5;

const EMPTY: ProbedStructures = { repeatingTables: [], transposedMatrices: [], warnings: [] };

/** Strip markdown fences the model may add despite being told not to. */
function unfence(raw: string): string {
  const trimmed = raw.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*\n([\s\S]*?)\n?```$/);
  return (fenced ? fenced[1] : trimmed).trim();
}

/** A clean, bounded label, or null if it is not usable as one. */
function label(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const text = value.replace(/\s+/g, ' ').trim();
  if (!text || text.length > MAX_LABEL_LENGTH) return null;
  return text;
}

/** Every entry must be a usable label — a partial list is worse than none. */
function labelList(value: unknown): string[] | null {
  if (!Array.isArray(value) || value.length === 0 || value.length > MAX_LABELS) return null;
  const out: string[] = [];
  for (const entry of value) {
    const text = label(entry);
    if (!text) return null;
    out.push(text);
  }
  return out;
}

function confident(value: unknown): boolean {
  // Missing confidence is treated as confident: the field is advisory, and a
  // model that omits it has not told us it is unsure.
  if (value === undefined || value === null) return true;
  if (typeof value !== 'number' || !Number.isFinite(value)) return true;
  return value >= MIN_CONFIDENCE;
}

/**
 * Validate a structure-probe reply and convert it to hints.
 *
 * Never throws. Anything unparseable, mis-shaped or low-confidence yields no
 * hint for that table, and the PDF converts exactly as it did before.
 */
export function parseStructureProbe(raw: string): ProbedStructures {
  if (!raw || !raw.trim()) return EMPTY;

  let parsed: unknown;
  try {
    parsed = JSON.parse(unfence(raw));
  } catch {
    return { ...EMPTY, warnings: ['the page-structure probe returned unusable output'] };
  }

  const tables = (parsed as { tables?: unknown })?.tables;
  if (!Array.isArray(tables)) {
    return { ...EMPTY, warnings: ['the page-structure probe returned no table list'] };
  }

  const repeatingTables: RepeatingTableHint[] = [];
  const transposedMatrices: TransposedMatrixHint[] = [];
  const warnings = new Set<string>();

  for (const entry of tables.slice(0, MAX_TABLES)) {
    if (!entry || typeof entry !== 'object') continue;
    const table = entry as Record<string, unknown>;

    if (!confident(table['confidence'])) {
      warnings.add('a table structure was reported with low confidence and was not used as a hint');
      continue;
    }

    const addLabel = label(table['addLabel']) ?? undefined;

    if (table['kind'] === 'matrix') {
      const rowLabels = labelList(table['rowLabels']);
      const instanceHeaders = labelList(table['instanceHeaders']);
      if (!rowLabels || !instanceHeaders || rowLabels.length < MIN_MATRIX_ROWS) {
        warnings.add('a reported matrix table was incomplete and was not used as a hint');
        continue;
      }
      transposedMatrices.push({
        labelHeader: label(table['labelHeader']) ?? 'Parameter',
        rowLabels,
        instanceHeaders,
        addInstanceLabel: addLabel,
      });
      continue;
    }

    if (table['kind'] === 'log') {
      const columns = labelList(table['columns']);
      if (!columns || columns.length < MIN_LOG_COLUMNS) {
        warnings.add('a reported repeating table was incomplete and was not used as a hint');
        continue;
      }
      repeatingTables.push({ columns, addLabel });
      continue;
    }

    // Any other "kind" is a shape this pipeline has no hint for. Silently
    // ignored rather than coerced into one of the two we do.
  }

  return { repeatingTables, transposedMatrices, warnings: [...warnings] };
}

/**
 * Does this UI schema contain a `recordTable` control anywhere?
 *
 * Used to tell "no structure was detected" apart from "structure was detected
 * and the model ignored it" — the two look identical in the finished form but
 * have completely different fixes.
 */
export function hasRecordTable(uiSchema: unknown): boolean {
  if (!uiSchema || typeof uiSchema !== 'object') return false;

  if (Array.isArray(uiSchema)) return uiSchema.some(hasRecordTable);

  const node = uiSchema as Record<string, unknown>;
  const omf = (node['options'] as Record<string, unknown> | undefined)?.['omf'] as
    | Record<string, unknown>
    | undefined;
  if (omf?.['control'] === 'recordTable') return true;

  return Object.values(node).some(hasRecordTable);
}
