/**
 * UI Schema — SOURCE OF TRUTH for screen presentation and layout.
 *
 * Vocabulary follows JSON Forms (Control/scope/elements/rule) because JSON Forms
 * is the chosen jsonforms-engine renderer for both React and Angular.
 *
 * Platform extensions ride under a dedicated vendor namespace `options.omf` so
 * they never collide with JSON Forms' own `options.*` keys (detail, format,
 * multi, …). Stock JSON Forms renderers ignore/pass through `options.omf`; our
 * registered custom renderers interpret it.
 *
 * Layout only — never data validation (that is the Data Schema's job).
 */

import type { JsonSchema } from './data-schema';

export type UiRuleEffect = 'SHOW' | 'HIDE' | 'ENABLE' | 'DISABLE';

/** JSON Forms leaf-condition style: a scope into the data plus a matching schema. */
export interface UiCondition {
  scope: string;
  schema?: JsonSchema;
}

export interface UiRule {
  effect: UiRuleEffect;
  condition: UiCondition;
}

export type LabelPosition = 'top' | 'left' | 'hidden';

/** Screen-only overrides (omf namespace). */
export interface OmfScreenOptions {
  /** Grid span out of 12. */
  colSpan?: number;
  /** Textarea rows. */
  rows?: number;
  labelPosition?: LabelPosition;
  inline?: boolean;
}

/** Print-only overrides (omf namespace), in print-safe units. */
export interface OmfPrintOptions {
  widthMm?: number;
  heightMm?: number;
  minHeightMm?: number;
  fontSizePt?: number;
  fontWeight?: 'normal' | 'bold';
  labelPosition?: LabelPosition;
  border?: boolean;
  borderMm?: number;
  align?: 'left' | 'center' | 'right';
}

/** Vendor-namespaced extension bag carried on any element under `options.omf`. */
export interface OmfOptions {
  /** Custom control/layout type resolved via the renderer's registry (e.g. 'scoringMatrix'). */
  control?: string;
  /**
   * Group rendering style. 'section' (default) is a bordered box with a shaded
   * header band. 'subsection' is an indented sub-heading with its children
   * nested beneath it and NO box — for a heading-plus-indented-list inside a
   * section (e.g. "Immobility … PLUS one or more of:" followed by its factors).
   */
  variant?: 'section' | 'subsection';
  readOnly?: boolean;
  screen?: OmfScreenOptions;
  print?: OmfPrintOptions;
  /**
   * Accent colour (hex, e.g. '#c0392b') for a boxed clinical section. The
   * renderer draws the section border and header icon/text in this colour to
   * reproduce colour-coded paper domains (e.g. a red CARDIOVASCULAR box).
   */
  accentColor?: string;
  /**
   * A leading glyph/emoji shown in a section header (e.g. '❤️' for
   * CARDIOVASCULAR, '🎂' for AGE) to reproduce the source form's iconography.
   */
  icon?: string;
  /**
   * Point value for a scored checkbox row. The renderer shows a colour-coded
   * badge (1→blue, 2→green, 3→amber, 5→red) on the right of the row, matching
   * the paper form's points column. Server-side scoring stays authoritative.
   */
  points?: number;
  /**
   * Points per option for a SCORED SINGLE-SELECT, keyed by the enum code the
   * control stores: `{ NO: 0, YES: 25 }`.
   *
   * `points` above cannot express this. It is one number for one control, which
   * fits a tick-box row ("Acute MI …… 1 point") but not an instrument where the
   * *choice* carries the score — Morse Fall (Ambulatory aid: none 0 / crutches
   * 15 / furniture 30), Braden, GCS. Without somewhere to put them, a generator
   * has only bad options: split one dropdown into several booleans, or smuggle
   * the number into the code as `YES_25`, which scores nothing and shows the
   * user `YES_25`.
   *
   * Codes stay clean and language-independent; the number lives here. Labels
   * come from the dataSchema's `oneOf` titles or `optionLabels`.
   */
  optionPoints?: Record<string, number>;
  /**
   * Display labels for an enum's codes, keyed by code: `{ NO: 'No' }`.
   *
   * Prefer `oneOf` with `const` + `title` in the dataSchema — that is the JSON
   * Forms-native way and keeps the label beside the value it names. Use this
   * when the schema already carries a plain `enum` and rewriting it would be
   * churn. Either way the renderer never shows a bare code when a label exists.
   */
  optionLabels?: Record<string, string>;
  /**
   * Distinct point values present in a section, rendered as small chips in the
   * section header (e.g. [1, 2, 3]) mirroring a paper legend band.
   */
  pointLegend?: number[];
  /**
   * Suppress the live "Σ n" subtotal chip a section header gets automatically
   * when the section contains scored fields. The scoring itself is untouched —
   * items keep contributing to the grand total; only this section's badge is
   * hidden. Exists so "remove the Σ 0 from that box" is expressible in the
   * definition rather than impossible.
   */
  hideSectionTotal?: boolean;
  /**
   * Risk-stratification bands for a scoreSummary element: the total maps to the
   * band whose [minScore, maxScore] range contains it (both bounds inclusive
   * and optional). Mirrors a paper "score → risk level" table.
   */
  bands?: Array<{ minScore?: number; maxScore?: number; label: string; color?: string }>;
  /**
   * Column definitions for an `OmfTableLayout`, mirroring a paper/HTML table's
   * `<thead>`. When present the table renders a real header row and each
   * `OmfTableRow` child is placed in its OWN cell, aligned to these columns —
   * so an 8-column sign-off grid looks like the source instead of stacking.
   *
   * Cell controls do not repeat their own label in this mode: the column header
   * already names them. Omit `columns` to keep the two-cell
   * (row label | contents) layout used by left-label tables.
   */
  columns?: Array<{
    /**
     * Stable identifier for the column. Required by `checklistMatrix`, which
     * stores its value as `{ [rowKey]: { [colKey]: true } }`; unused by
     * `OmfTableLayout`, whose columns are purely positional.
     */
    key?: string;
    label?: string;
    /** CSS width for the column, e.g. '40px' or '12%'. */
    width?: string;
    align?: 'left' | 'center' | 'right';
  }>;
  /**
   * Configuration for a `recordTable` control — an array of objects the user can
   * add to and remove from, shown as a log: a toolbar with a live count and an
   * add button, one summary row per record, and an expandable inline detail
   * panel for the selected row.
   *
   * This reproduces the very common clinical pattern of a repeating encounter
   * log (treatment days, medication rounds, observation entries) where the table
   * is only a summary and the real form lives behind each row. The per-record UI
   * schema is the standard JSON Forms `options.detail`; typically an
   * `OmfTabsLayout` so the detail is tabbed rather than one long scroll.
   */
  recordTable?: OmfRecordTableOptions;
  [key: string]: unknown;
}

/** Summary column of a `recordTable`, read from each record's own data. */
export interface OmfRecordTableColumn {
  /** Header text, e.g. 'Cycle / Day#'. */
  label: string;
  /**
   * Dot path to the value INSIDE one record, e.g. 'date' or 'timelog.cycle'.
   * Omit for a purely derived column (see `countOf` / `pairWith`).
   */
  path?: string;
  /**
   * Render `<count>` of a nested array on the record instead of a value, e.g.
   * 'adverseEvents' → the number of adverse events logged for that day.
   */
  countOf?: string;
  /**
   * Render two values in one cell as `a / b` — how paper forms print combined
   * columns like 'Start / Finish' or 'Cycle / Day#'. Paired with `path`.
   */
  pairWith?: string;
  width?: string;
  align?: 'left' | 'center' | 'right';
}

export interface OmfRecordTableOptions {
  /**
   * Which way the records run.
   *
   * - `'rows'` (default) — one row per record, columns are fields. Right for a
   *   chronological log that grows downward (treatment days, drug rounds).
   * - `'columns'` — one COLUMN per record, with the field labels down the left.
   *   Mirrors paper charts that compare instances side by side, such as a
   *   cannula chart where each cannula gets its own column. Choose this only
   *   when the source is laid out that way; both orientations capture identical
   *   data, so it is purely a fidelity choice.
   */
  orientation?: 'rows' | 'columns';
  /**
   * Noun for one record, heading each column when `orientation` is 'columns'
   * — 'Cannula' yields "Cannula 1", "Cannula 2". Defaults to 'Record'.
   */
  instanceLabel?: string;
  /** Add-button label, e.g. '+ Add treatment day'. */
  addLabel?: string;
  /**
   * Count line above the table. `{n}` is replaced with the record count, and
   * `{s}` with '' or 's' for naive pluralisation — e.g.
   * '{n} treatment day{s} logged this month'.
   */
  countLabel?: string;
  /** Shown in place of rows when the array is empty. */
  emptyLabel?: string;
  /** Confirmation prompt before removing a record. */
  removeConfirm?: string;
  /** Summary columns, in display order. */
  columns?: OmfRecordTableColumn[];
}

export interface UiOptions {
  /** Platform extensions — see OmfOptions. */
  omf?: OmfOptions;
  /** JSON Forms native options (detail, format, multi, …) pass through untyped. */
  [key: string]: unknown;
}

/** Standard JSON Forms element types. */
export type StandardUiElementType =
  | 'VerticalLayout'
  | 'HorizontalLayout'
  | 'Group'
  | 'Categorization'
  | 'Category'
  | 'Control'
  | 'Label';

/**
 * Custom layout element type identifiers (prefix `Omf`). These are dispatched to
 * registered custom renderers/testers; the AI generator and both framework
 * renderers share this vocabulary.
 */
export type OmfLayoutType =
  | 'OmfPageLayout'
  | 'OmfClinicalSection'
  | 'OmfGridLayout'
  | 'OmfTableLayout'
  | 'OmfTableRow'
  /**
   * A tab strip over its child elements: each child is one tab page, titled by
   * that child's `label`. Used as the `options.detail` of a `recordTable` so a
   * ~100-field record reads as tabs instead of one long scroll, matching source
   * forms that group a record's detail behind a tab bar. Falls back to stacked
   * sections when printed.
   */
  | 'OmfTabsLayout'
  | 'OmfPatientHeader'
  | 'OmfCheckboxGroup'
  | 'OmfSignatureBlock'
  | 'OmfCommentsBlock'
  | 'OmfPrintHeader'
  | 'OmfPrintFooter'
  | 'OmfStaticText';

export interface UiSchemaElementBase {
  type: string;
  label?: string | boolean;
  rule?: UiRule;
  options?: UiOptions;
}

export interface UiControl extends UiSchemaElementBase {
  type: 'Control';
  /** JSON pointer into the Data Schema, e.g. '#/properties/patient/properties/patientId'. */
  scope: string;
}

export interface UiLayout extends UiSchemaElementBase {
  type: 'VerticalLayout' | 'HorizontalLayout' | 'Group';
  elements: UiSchemaElement[];
}

export interface UiCategory extends UiSchemaElementBase {
  type: 'Category';
  elements: UiSchemaElement[];
}

export interface UiCategorization extends UiSchemaElementBase {
  type: 'Categorization';
  elements: UiCategory[];
}

export interface UiLabelElement extends UiSchemaElementBase {
  type: 'Label';
  text: string;
}

/**
 * Custom layout element (e.g. OmfTableLayout, OmfSignatureBlock).
 * `elements`/`scope` are optional because different custom types use different
 * shapes; the registered renderer defines the contract per type.
 */
export interface UiCustomElement extends UiSchemaElementBase {
  type: OmfLayoutType;
  scope?: string;
  elements?: UiSchemaElement[];
}

export type UiSchemaElement =
  | UiControl
  | UiLayout
  | UiCategory
  | UiCategorization
  | UiLabelElement
  | UiCustomElement;

export interface UiSchema {
  schemaVersion: string;
  /** Root element — typically a VerticalLayout representing the page. */
  layout: UiSchemaElement;
}
