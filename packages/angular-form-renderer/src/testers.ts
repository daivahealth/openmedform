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
  schemaMatches,
  type UISchemaElement,
  uiTypeIs,
} from '@jsonforms/core';

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
