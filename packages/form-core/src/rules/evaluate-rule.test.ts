import { describe, it, expect } from 'vitest';
import type { UiRule } from '@openmedform/form-schema-types';
import {
  evaluateCondition,
  evaluateRule,
  evaluateElementState,
  filterVisibleElements,
  hasElementRules,
} from './evaluate-rule';

const spo2Low: UiRule = {
  effect: 'SHOW',
  condition: {
    scope: '#/properties/assessment/properties/spo2',
    schema: { type: 'integer', maximum: 91 },
  },
};

describe('evaluateCondition', () => {
  it('is active when the scoped value matches the schema', () => {
    expect(evaluateCondition(spo2Low.condition, { assessment: { spo2: 88 } })).toBe(true);
  });
  it('is inactive when the scoped value does not match', () => {
    expect(evaluateCondition(spo2Low.condition, { assessment: { spo2: 98 } })).toBe(false);
  });
  it('treats a missing schema as a presence check', () => {
    const cond = { scope: '#/properties/situation' };
    expect(evaluateCondition(cond, { situation: 'text' })).toBe(true);
    expect(evaluateCondition(cond, { situation: '' })).toBe(false);
    expect(evaluateCondition(cond, {})).toBe(false);
  });
});

describe('evaluateRule effects', () => {
  const dataLow = { assessment: { spo2: 88 } };
  const dataNormal = { assessment: { spo2: 98 } };

  it('SHOW reveals when active', () => {
    expect(evaluateRule({ ...spo2Low, effect: 'SHOW' }, dataLow).visible).toBe(true);
    expect(evaluateRule({ ...spo2Low, effect: 'SHOW' }, dataNormal).visible).toBe(false);
  });
  it('HIDE conceals when active', () => {
    expect(evaluateRule({ ...spo2Low, effect: 'HIDE' }, dataLow).visible).toBe(false);
    expect(evaluateRule({ ...spo2Low, effect: 'HIDE' }, dataNormal).visible).toBe(true);
  });
  it('ENABLE toggles enablement, stays visible', () => {
    const s = evaluateRule({ ...spo2Low, effect: 'ENABLE' }, dataNormal);
    expect(s).toEqual({ visible: true, enabled: false });
  });
  it('DISABLE toggles enablement, stays visible', () => {
    const s = evaluateRule({ ...spo2Low, effect: 'DISABLE' }, dataLow);
    expect(s).toEqual({ visible: true, enabled: false });
  });
});

describe('evaluateElementState', () => {
  it('defaults to visible+enabled when no rule', () => {
    expect(evaluateElementState({}, {})).toEqual({ visible: true, enabled: true });
  });
  it('applies the element rule when present', () => {
    expect(
      evaluateElementState({ rule: spo2Low }, { assessment: { spo2: 88 } }),
    ).toEqual({ visible: true, enabled: true });
  });
});

describe('filterVisibleElements', () => {
  const showWhenPresent: UiRule = {
    effect: 'SHOW',
    condition: { scope: '#/properties/feature1', schema: { const: 'PRESENT' } },
  };
  const rows = [
    { label: 'Feature 1' },
    { label: 'Feature 2', rule: showWhenPresent },
    { label: 'Feature 3', rule: showWhenPresent },
  ];

  it('drops children whose SHOW rule is inactive', () => {
    expect(filterVisibleElements(rows, {}).map((v) => v.element.label)).toEqual(['Feature 1']);
  });

  it('reveals them once the controlling value matches', () => {
    const visible = filterVisibleElements(rows, { feature1: 'PRESENT' });
    expect(visible.map((v) => v.element.label)).toEqual(['Feature 1', 'Feature 2', 'Feature 3']);
  });

  it('keeps each child original index so siblings do not renumber', () => {
    const visible = filterVisibleElements(
      [{ label: 'a' }, { label: 'b', rule: showWhenPresent }, { label: 'c' }],
      {},
    );
    expect(visible.map((v) => v.index)).toEqual([0, 2]);
  });

  it('ANDs parent enablement with a DISABLE rule', () => {
    const disabled: UiRule = { ...showWhenPresent, effect: 'DISABLE' };
    expect(filterVisibleElements([{ rule: disabled }], { feature1: 'PRESENT' })[0].enabled).toBe(
      false,
    );
    expect(filterVisibleElements([{}], {}, false)[0].enabled).toBe(false);
  });

  it('treats a missing list as empty', () => {
    expect(filterVisibleElements(undefined, {})).toEqual([]);
  });
});

describe('hasElementRules', () => {
  it('is false when nothing carries a rule', () => {
    expect(hasElementRules([{}, {}])).toBe(false);
    expect(hasElementRules(undefined)).toBe(false);
  });
  it('is true when any child carries one', () => {
    expect(hasElementRules([{}, { rule: spo2Low }])).toBe(true);
  });
});
