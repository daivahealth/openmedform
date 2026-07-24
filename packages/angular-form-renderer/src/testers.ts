/**
 * Testers for the Angular renderer set — pure functions, no Angular imports, so
 * they can be unit-tested directly. The omf matchers mirror the React renderer
 * (packages/react-form-renderer) exactly, so both frameworks resolve the same
 * UI element to the same conceptual control.
 */

import type { UISchemaElement } from '@jsonforms/core';

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
