/**
 * JSON Forms testers keyed on the platform's `options.omf` extension bag.
 *
 * JSON Forms' stock `optionIs` compares an option to a scalar; our custom
 * controls are selected by `options.omf.control` (a string inside a nested
 * object), so we provide dedicated matchers. Custom renderers register with a
 * high rank so they win over the vanilla defaults for the same element.
 */

import type { UISchemaElement } from '@jsonforms/core';

/** Rank used by all omf-selected custom controls (beats vanilla defaults). */
export const OMF_CONTROL_RANK = 20;

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
