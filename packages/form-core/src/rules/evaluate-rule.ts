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
