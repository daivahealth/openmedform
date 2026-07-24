import { describe, it, expect } from 'vitest';
import {
  getValueAtPath,
  setValueAtPath,
  deleteValueAtPath,
  getValueAtScope,
  setValueAtScope,
} from './data-path';

describe('getValueAtPath', () => {
  const data = { assessment: { spo2: 95 }, situation: 'x' };
  it('reads nested and top-level values', () => {
    expect(getValueAtPath(data, 'assessment.spo2')).toBe(95);
    expect(getValueAtPath(data, ['situation'])).toBe('x');
  });
  it('returns undefined for missing branches', () => {
    expect(getValueAtPath(data, 'assessment.missing')).toBeUndefined();
    expect(getValueAtPath(data, 'nope.deep')).toBeUndefined();
  });
});

describe('setValueAtPath', () => {
  it('sets nested values without mutating the input', () => {
    const original = { assessment: { spo2: 95 } };
    const next = setValueAtPath(original, 'assessment.pulse', 138);
    expect(next).toEqual({ assessment: { spo2: 95, pulse: 138 } });
    expect(original).toEqual({ assessment: { spo2: 95 } }); // untouched
    expect(next.assessment).not.toBe(original.assessment); // branch cloned
  });

  it('creates intermediate objects as needed', () => {
    expect(setValueAtPath(undefined, 'a.b.c', 1)).toEqual({ a: { b: { c: 1 } } });
  });

  it('overwrites a non-object branch rather than throwing', () => {
    const next = setValueAtPath({ a: 5 }, 'a.b', 1);
    expect(next).toEqual({ a: { b: 1 } });
  });
});

describe('deleteValueAtPath', () => {
  it('removes a value immutably', () => {
    const original = { a: { b: 1, c: 2 } };
    const next = deleteValueAtPath(original, 'a.b');
    expect(next).toEqual({ a: { c: 2 } });
    expect(original).toEqual({ a: { b: 1, c: 2 } });
  });
});

describe('scope binding', () => {
  it('reads and writes by UI scope', () => {
    const data = { assessment: { spo2: 88 } };
    expect(getValueAtScope(data, '#/properties/assessment/properties/spo2')).toBe(88);
    const next = setValueAtScope(data, '#/properties/assessment/properties/spo2', 99);
    expect(getValueAtScope(next, '#/properties/assessment/properties/spo2')).toBe(99);
  });
});
