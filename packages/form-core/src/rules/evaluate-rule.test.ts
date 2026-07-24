import { describe, it, expect } from 'vitest';
import type { UiRule } from '@openmedform/form-schema-types';
import {
  evaluateCondition,
  evaluateRule,
  evaluateElementState,
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
