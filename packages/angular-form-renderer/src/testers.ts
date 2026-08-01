/**
 * Testers for the Angular renderer set — pure functions, no Angular imports, so
 * they can be unit-tested directly. The omf matchers mirror the React renderer
 * (packages/react-form-renderer) exactly, so both frameworks resolve the same
 * UI element to the same conceptual control.
 */

import { rankWith, uiTypeIs, type UISchemaElement } from '@jsonforms/core';

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
export const recordTableTester = rankWith(OMF_CONTROL_RANK, omfControlIs('recordTable'));

/** Selects the tab-strip layout used for a record's detail panel. */
export const omfTabsTester = rankWith(STANDARD_RANK, uiTypeIs('OmfTabsLayout'));
