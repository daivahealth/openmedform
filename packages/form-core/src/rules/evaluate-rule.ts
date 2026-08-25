/**
 * Conditional-rule engine — evaluates a UI element's SHOW/HIDE/ENABLE/DISABLE
 * rule against the current response data.
 *
 * A rule's condition is JSON Forms style: a `scope` into the data plus an
 * optional matching `schema`. The condition is "active" when the value at the
 * scope satisfies the schema (validated with the same Ajv path used for data
 * validation). If no schema is given, the condition is active when a value is
 * present (non-empty) — a convenient "has value" trigger.
 *
 * Framework-independent: no rendering, just visibility/enablement decisions.
 */

import type { UiCondition, UiRule } from '@openmedform/form-schema-types';
import { validateData } from '../validation/validate-data';
import { getValueAtScope } from '../binding/data-path';

/** Element with an optional rule — accepts any UI element shape. */
export interface RuledElement {
  rule?: UiRule;
}

export interface ElementState {
  visible: boolean;
  enabled: boolean;
}

const VISIBLE_ENABLED: ElementState = { visible: true, enabled: true };

/** True when the condition's scope value satisfies its schema. */
export function evaluateCondition(condition: UiCondition, data: unknown): boolean {
  const value = getValueAtScope(data, condition.scope);
  if (condition.schema === undefined) {
    return value !== undefined && value !== null && value !== '';
  }
  return validateData(condition.schema, value).valid;
}

/** Resolve a single rule to a visibility/enablement decision. */
export function evaluateRule(rule: UiRule, data: unknown): ElementState {
  const active = evaluateCondition(rule.condition, data);
  switch (rule.effect) {
    case 'SHOW':
      return { visible: active, enabled: true };
    case 'HIDE':
      return { visible: !active, enabled: true };
    case 'ENABLE':
      return { visible: true, enabled: active };
    case 'DISABLE':
      return { visible: true, enabled: !active };
    default:
      return VISIBLE_ENABLED;
  }
}

/**
 * Resolve an element's effective state. Elements without a rule are always
 * visible and enabled.
 */
export function evaluateElementState(element: RuledElement, data: unknown): ElementState {
  return element.rule ? evaluateRule(element.rule, data) : VISIBLE_ENABLED;
}

/** One surviving child of a container, with its position in the original list. */
export interface VisibleElement<T> {
  element: T;
  /**
   * Index in the ORIGINAL list. Renderers key/track on this so a child that
   * appears or disappears does not renumber — and therefore re-mount — its
   * siblings.
   */
  index: number;
  /** Parent enablement AND-ed with this element's own ENABLE/DISABLE rule. */
  enabled: boolean;
}

/**
 * Resolve the children a container should actually render.
 *
 * Containers that dispatch each child through the host framework get rule
 * handling for free. Some do not: a table renderer maps a row straight onto a
 * `<tr>` because the row IS the layout, and a rule on that row was silently
 * ignored in both renderers. Both now call this, so a progressive-disclosure
 * table (reveal Feature 2 once Feature 1 is present) behaves identically in
 * React, in Angular, and against the same form-core evaluation the server uses.
 */
export function filterVisibleElements<T extends RuledElement>(
  elements: readonly T[] | undefined,
  data: unknown,
  parentEnabled = true,
): VisibleElement<T>[] {
  const visible: VisibleElement<T>[] = [];
  (elements ?? []).forEach((element, index) => {
    const state = evaluateElementState(element, data);
    if (!state.visible) return;
    visible.push({ element, index, enabled: parentEnabled && state.enabled });
  });
  return visible;
}

/**
 * True when any child carries a rule. Lets a renderer skip the per-element
 * state subscription that conditional children would otherwise require — most
 * containers have no rules anywhere, and on a large clinical form that
 * subscription is not free.
 */
export function hasElementRules(elements: readonly RuledElement[] | undefined): boolean {
  return (elements ?? []).some((element) => element?.rule !== undefined);
}
