/**
 * Design tokens — the single source of truth for the platform's visual and
 * layout constants.
 *
 * These values are consumed as CSS custom properties (see `toCssVariables`) by
 * BOTH the React and Angular renderers. Rendering the same FormDefinition with
 * the same tokens is what makes the two frameworks produce *equivalent* output
 * (same typography scale, spacing, grid, borders) — not merely structurally
 * similar. The `omf` UI-schema screen/print options are expressed relative to
 * these tokens.
 *
 * Framework-independent: plain constants, no imports.
 */

/** 12-column grid, matching the `omf.screen.colSpan` range. */
export const grid = {
  columns: 12,
  /** Gap between grid cells. */
  gapPx: 12,
} as const;

/** Typography scale (screen). Print sizes are expressed in pt on the schema. */
export const typography = {
  fontFamily:
    "system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif",
  bodySizePx: 14,
  labelSizePx: 13,
  sectionTitleSizePx: 15,
  helpTextSizePx: 12,
  lineHeight: 1.4,
  labelWeight: 600,
} as const;

/** Vertical/horizontal rhythm. */
export const spacing = {
  /** Space between fields within a section. */
  fieldGapPx: 12,
  /** Space between sections/groups. */
  sectionGapPx: 20,
  /** Inner padding of a section/group. */
  sectionPaddingPx: 16,
  /** Padding inside an input control. */
  controlPaddingPx: 8,
} as const;

/** Control geometry. */
export const controls = {
  /** Minimum height of a single-line control/row. */
  rowMinHeightPx: 36,
  borderWidthPx: 1,
  borderRadiusPx: 4,
  /** Default rows for a textarea when `omf.screen.rows` is unset. */
  textareaRows: 3,
} as const;

/**
 * Neutral, print-friendly palette (works in the `blackAndWhite` print mode).
 * Renderers may theme further, but these are the shared defaults.
 */
export const color = {
  border: '#c8cdd4',
  text: '#1c2430',
  labelText: '#3a4552',
  sectionBg: '#f7f8fa',
  invalid: '#c0392b',
} as const;

/** Responsive breakpoints. Below `sm`, multi-column layouts stack to one column. */
export const breakpoints = {
  smPx: 640,
  mdPx: 900,
} as const;

/** The complete token set, grouped. */
export const tokens = {
  grid,
  typography,
  spacing,
  controls,
  color,
  breakpoints,
} as const;

export type Tokens = typeof tokens;
