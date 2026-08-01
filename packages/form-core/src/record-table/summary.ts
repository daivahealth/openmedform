/**
 * Pure logic behind the `recordTable` control — the repeating clinical encounter
 * log (treatment days, medication rounds, observation entries).
 *
 * This lives in form-core, not in either renderer, because the React and Angular
 * controls MUST agree exactly: the same FormDefinition has to read identically
 * in the web preview and in an EMR embedding the Angular renderer. Two hand-kept
 * copies of "how a summary cell is derived" would drift, and a treatment-day log
 * that shows a different date or adverse-event count in two places is a clinical
 * safety problem, not a cosmetic one.
 *
 * Framework-independent: no React, no Angular, no DOM.
 */

/** A summary column of a record table, as declared in `options.omf.recordTable`. */
export interface RecordTableColumn {
  label: string;
  /** Dot path to the value inside one record, e.g. 'timelog.cycle'. */
  path?: string;
  /** Render the length of a nested array instead of a value, e.g. 'adverseEvents'. */
  countOf?: string;
  /** Render two values in one cell as `a / b` (e.g. 'Start / Finish'). */
  pairWith?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface RecordTableConfig {
  /**
   * 'rows' (default) puts one record per row; 'columns' puts one record per
   * COLUMN with field labels down the left, mirroring paper charts that compare
   * instances side by side. Same data either way — purely a fidelity choice.
   */
  orientation?: 'rows' | 'columns';
  /**
   * Noun for one record, used to head each column in `orientation: 'columns'`
   * — 'Cannula' yields "Cannula 1", "Cannula 2". Defaults to 'Record'. Getting
   * this right is most of the point of column mode: the chart should read like
   * the paper it replaces.
   */
  instanceLabel?: string;
  addLabel?: string;
  countLabel?: string;
  emptyLabel?: string;
  removeConfirm?: string;
  columns?: RecordTableColumn[];
}

/** Printed in a summary cell when the underlying value is absent, as on paper. */
export const EMPTY_CELL = '—';

/**
 * Read a dot path out of one record. A missing intermediate link yields
 * undefined rather than throwing, because a partially filled record is the
 * normal case — a nurse opens a treatment day and fills it over a shift.
 */
export function readRecordPath(record: unknown, path: string | undefined): unknown {
  if (!path) return undefined;
  let cursor: unknown = record;
  for (const key of path.split('.')) {
    if (cursor === null || typeof cursor !== 'object') return undefined;
    cursor = (cursor as Record<string, unknown>)[key];
  }
  return cursor;
}

/** Render one summary cell's text for a record. */
export function recordCellText(record: unknown, col: RecordTableColumn): string {
  if (col.countOf) {
    const arr = readRecordPath(record, col.countOf);
    return String(Array.isArray(arr) ? arr.length : 0);
  }
  const primary = readRecordPath(record, col.path);
  if (col.pairWith) {
    const secondary = readRecordPath(record, col.pairWith);
    return `${scalarText(primary)} / ${scalarText(secondary)}`;
  }
  return scalarText(primary);
}

function scalarText(value: unknown): string {
  if (value === undefined || value === null || value === '') return EMPTY_CELL;
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  return String(value);
}

/**
 * Resolve the count line above the table. `{n}` becomes the record count and
 * `{s}` an empty string or 's', so an author can write
 * '{n} treatment day{s} logged this month' and get correct singular/plural.
 */
export function recordCountText(template: string | undefined, count: number): string {
  if (!template) return `${count} record${count === 1 ? '' : 's'}`;
  return template.replace(/\{n\}/g, String(count)).replace(/\{s\}/g, count === 1 ? '' : 's');
}

/** Minimal JSON Schema shape needed to seed a record; avoids a dependency on Ajv types. */
interface SeedSchema {
  type?: string | string[];
  default?: unknown;
  properties?: Record<string, SeedSchema>;
}

/**
 * Seed a new record from the item schema so its summary row has the right shape
 * the moment it is added — nested objects present, arrays empty — rather than
 * filling in as the user types. JSON Forms' own default-value helper only walks
 * the top level, which would leave `record.timelog.cycle` unreadable and print
 * an em dash where the form should already show a blank pair.
 */
export function createRecordDefault(schema: SeedSchema | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, prop] of Object.entries(schema?.properties ?? {})) {
    if (prop.default !== undefined) out[key] = prop.default;
    else if (prop.type === 'object') out[key] = createRecordDefault(prop);
    else if (prop.type === 'array') out[key] = [];
  }
  return out;
}

/**
 * Derive summary columns for an array the author never configured.
 *
 * A model that emits an array of objects without `omf.recordTable` used to fall
 * through to the stock JSON Forms list widget — the "Add to X / Items / Valid /
 * No data" block that looks nothing like a clinical form. Deriving a reasonable
 * table instead means an unconfigured array degrades to something usable rather
 * than to something broken.
 *
 * Picks the leading scalar properties, which in practice are the identifying
 * ones (a date, a name, a code) because generators emit them first. Nested
 * objects and arrays are skipped — they belong in the detail panel, not a cell.
 */
export function deriveRecordColumns(
  itemSchema: SeedSchema | undefined,
  limit = 4,
): RecordTableColumn[] {
  const columns: RecordTableColumn[] = [];
  for (const [key, raw] of Object.entries(itemSchema?.properties ?? {})) {
    if (columns.length >= limit) break;
    const prop = raw as SeedSchema & { title?: string };
    const type = Array.isArray(prop.type) ? prop.type[0] : prop.type;
    if (type === 'object' || type === 'array') continue;
    columns.push({ label: prop.title ?? humanizeKey(key), path: key });
  }
  return columns;
}

/** `insertedBy` -> `Inserted by`, for a property with no title. */
function humanizeKey(key: string): string {
  const spaced = key.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]+/g, ' ');
  return spaced.charAt(0).toUpperCase() + spaced.slice(1).toLowerCase();
}
