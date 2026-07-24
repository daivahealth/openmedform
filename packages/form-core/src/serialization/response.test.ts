import { describe, it, expect } from 'vitest';
import {
  createEmptyResponse,
  pruneEmptyValues,
  serializeForSubmit,
} from './response';
import { rrtSbarReference } from '../fixtures/rrt-sbar.reference';
import { rrtSbarSampleCompleted } from '../fixtures/rrt-sbar.samples';

const dataSchema = rrtSbarReference.dataSchema;

describe('createEmptyResponse', () => {
  it('nests object properties without applying defaults when disabled', () => {
    const empty = createEmptyResponse(dataSchema, { applyDefaults: false });
    expect(empty.callDetails).toEqual({});
    expect(empty.assessment).toEqual({});
    // no scalar leaves seeded
    expect(empty.situation).toBeUndefined();
  });

  it('applies schema defaults by default', () => {
    const empty = createEmptyResponse(dataSchema);
    // reasonForCall booleans default to false
    expect((empty.reasonForCall as Record<string, unknown>).pulseLessThan40).toBe(false);
  });
});

describe('pruneEmptyValues', () => {
  it('removes empty leaves and empty objects but keeps false/0', () => {
    const input = {
      a: '',
      b: null,
      c: undefined,
      d: { e: '' },
      keepFalse: false,
      keepZero: 0,
      nested: { x: 1, y: '' },
    };
    expect(pruneEmptyValues(input)).toEqual({
      keepFalse: false,
      keepZero: 0,
      nested: { x: 1 },
    });
  });

  it('prunes array items element-wise', () => {
    expect(pruneEmptyValues({ list: [{ a: 1, b: '' }] })).toEqual({ list: [{ a: 1 }] });
  });
});

describe('serializeForSubmit', () => {
  it('prunes and validates a completed response as valid', () => {
    const result = serializeForSubmit(dataSchema, {
      ...rrtSbarSampleCompleted,
      reasonForCall: { ...(rrtSbarSampleCompleted.reasonForCall as object), other: '' },
    });
    expect(result.valid).toBe(true);
    expect(result.errors).toEqual([]);
    // the empty `other` was pruned out
    expect((result.response.reasonForCall as Record<string, unknown>).other).toBeUndefined();
  });

  it('reports validation errors for an invalid payload', () => {
    const result = serializeForSubmit(dataSchema, {
      callDetails: { date: '2026-07-24' },
      assessment: { spo2: 88 }, // low spo2 requires a recommendation
    });
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
  });
});
