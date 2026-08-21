/**
 * Testers for the Angular renderer set — pure functions, no Angular imports, so
 * they can be unit-tested directly. The omf matchers mirror the React renderer
 * (packages/react-form-renderer) exactly, so both frameworks resolve the same
 * UI element to the same conceptual control.
 */

import {
  and,
  isEnumControl,
  isOneOfEnumControl,
  isStringControl,
  or,
  rankWith,
  type RankedTester,
  schemaMatches,
  type UISchemaElement,
  uiTypeIs,
} from '@jsonforms/core';
import { OMF_CONTROL_NAMES } from '@openmedform/form-core';

/** Rank for omf/clinical custom controls — must beat the standard controls. */
export const OMF_CONTROL_RANK = 20;
/** Rank for the standard control/layout renderers. */
export const STANDARD_RANK = 2;

interface WithOmf {
  options?: { omf?: { control?: string } & Record<string, unknown> };
}

/** Read the `options.omf` bag off a UI element, if present. */
export function readOmf(uischema: UISchemaElement | undefined): Record<string, unknown> | undefined {
  return (uischema as WithOmf | undefined)?.options?.omf;
}

/** Tester predicate: matches when `options.omf.control === control`. */
export function omfControlIs(control: string) {
  return (uischema: UISchemaElement): boolean => readOmf(uischema)?.control === control;
}

/**
 * Selects the repeating-encounter-log control. Declared here rather than beside
 * the component so it stays importable without pulling in Angular — the record
 * table's selection behaviour is worth unit-testing on its own.
 */
/**
 * Matches an explicit `recordTable`, and ALSO any unconfigured array-of-objects.
 *
 * The second half is the safety net: without it such an array falls back to the
 * generic list widget, which is unusable on a clinical form. Mirrors the React
 * tester exactly so the same definition resolves the same way in both.
 */
const isObjectArrayControl = and(
  uiTypeIs('Control'),
  schemaMatches(
    (s) =>
      s?.type === 'array' &&
      !!s.items &&
      !Array.isArray(s.items) &&
      (s.items as { type?: string }).type === 'object',
  ),
);

export const recordTableTester = rankWith(
  OMF_CONTROL_RANK,
  or(omfControlIs('recordTable'), isObjectArrayControl),
);

/** An array whose items are enum/oneOf codes — a multi-select, not a list. */
const isMultiEnumArray = schemaMatches((s) => {
  if (s?.type !== 'array' || !s.items || Array.isArray(s.items)) return false;
  const items = s.items as { type?: string; enum?: unknown[]; oneOf?: unknown[] };
  return (
    (items.type === 'string' || items.type === 'number' || items.type === 'integer') &&
    (Array.isArray(items.enum) || Array.isArray(items.oneOf))
  );
});

/**
 * Selects the multi-select checkbox group: an explicit `checkboxGroup`, or any
 * enum/oneOf array. Rank ONE ABOVE the other omf controls on purpose: an
 * enum-array wearing the wrong control name (the AI used to emit
 * `checklistMatrix` for these) would otherwise reach the rows×columns matrix,
 * which needs omf.rows/columns config and renders an empty grid without it. A
 * real checklistMatrix stores a nested object, never an enum-array, so this
 * never steals a configured matrix. Mirrors the React tester exactly.
 */
export const checkboxGroupTester = rankWith(
  OMF_CONTROL_RANK + 1,
  or(omfControlIs('checkboxGroup'), isMultiEnumArray),
);

// --- one tester per canonical omf control ------------------------------------
// All defined HERE (pure, no Angular imports) rather than beside their
// components, so the parity test below the map can run them under vitest —
// @jsonforms/angular cannot be loaded outside an Angular build.

export const omfTextareaTester = rankWith(OMF_CONTROL_RANK, omfControlIs('textarea'));
export const omfRadioTester = rankWith(OMF_CONTROL_RANK, omfControlIs('radio'));
export const scoringMatrixTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoringMatrix'));
export const signatureDateTester = rankWith(OMF_CONTROL_RANK, omfControlIs('signatureDate'));
export const vitalSignsChartTester = rankWith(OMF_CONTROL_RANK, omfControlIs('vitalSignsChart'));
export const checklistMatrixTester = rankWith(OMF_CONTROL_RANK, omfControlIs('checklistMatrix'));
export const colorCodedGridTester = rankWith(OMF_CONTROL_RANK, omfControlIs('colorCodedGrid'));
export const clinicalReferenceTableTester = rankWith(
  OMF_CONTROL_RANK,
  omfControlIs('clinicalReferenceTable'),
);
export const riskStratificationTester = rankWith(
  OMF_CONTROL_RANK,
  omfControlIs('riskStratification'),
);
export const scoreSummaryTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoreSummary'));

/** A name from the canonical omf.control vocabulary (see form-core). */
export type OmfControlName = (typeof OMF_CONTROL_NAMES)[number];

/**
 * The tester for every canonical control. `satisfies Record<OmfControlName, …>`
 * makes coverage a COMPILE-TIME guarantee: adding a name to OMF_CONTROL_NAMES
 * without a tester here fails the build. The renderer set registers from this
 * map, and testers.test.ts asserts each tester actually claims its name.
 */
export const omfControlTesters = {
  textarea: omfTextareaTester,
  radio: omfRadioTester,
  checkboxGroup: checkboxGroupTester,
  scoringMatrix: scoringMatrixTester,
  signatureDate: signatureDateTester,
  vitalSignsChart: vitalSignsChartTester,
  checklistMatrix: checklistMatrixTester,
  colorCodedGrid: colorCodedGridTester,
  clinicalReferenceTable: clinicalReferenceTableTester,
  riskStratification: riskStratificationTester,
  scoreSummary: scoreSummaryTester,
  recordTable: recordTableTester,
} satisfies Record<OmfControlName, RankedTester>;

/** Selects the tab-strip layout used for a record's detail panel. */
export const omfTabsTester = rankWith(STANDARD_RANK, uiTypeIs('OmfTabsLayout'));

/**
 * Rank for the enum and date controls: ONE ABOVE the plain text control, and
 * that ordering is load-bearing.
 *
 * `{ type: 'string', oneOf: [...] }` is simultaneously a string control and a
 * single-select. At equal rank the registry keeps whichever was registered
 * first, and the field renders as an empty text box with its options nowhere
 * on screen — which is exactly what happened in the React renderer. Here the
 * ordering settles it.
 */
export const ENUM_DATE_RANK = STANDARD_RANK + 1;

/** Plain single-line text. Deliberately outranked by the enum tester. */
export const textControlTester = rankWith(STANDARD_RANK, isStringControl);

/**
 * Any single-select: a plain `enum`, or a `oneOf` of consts. `isEnumControl`
 * matches only the former, so both are needed or a titled oneOf falls through.
 */
export const enumControlTester = rankWith(
  ENUM_DATE_RANK,
  or(isEnumControl, isOneOfEnumControl),
);
