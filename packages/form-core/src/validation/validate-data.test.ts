import { describe, it, expect } from 'vitest';
import { validateData, checkSchemaCompiles } from './validate-data';
import { rrtSbarReference } from '../fixtures/rrt-sbar.reference';
import {
  rrtSbarSampleEmpty,
  rrtSbarSampleCompleted,
} from '../fixtures/rrt-sbar.samples';

const dataSchema = rrtSbarReference.dataSchema;

describe('RRT/SBAR reference — Phase 1 Ajv (2020-12) proof', () => {
  it('compiles the reference Data Schema under Ajv 2020-12', () => {
    expect(checkSchemaCompiles(dataSchema)).toBeNull();
  });

  it('validates the completed sample response', () => {
    const result = validateData(dataSchema, rrtSbarSampleCompleted);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('rejects a wrong data type (temperature as string)', () => {
    const bad = {
      ...rrtSbarSampleCompleted,
      assessment: { ...(rrtSbarSampleCompleted.assessment as object), temperature: 'hot' },
    };
    const result = validateData(dataSchema, bad);
    expect(result.valid).toBe(false);
    expect(result.errors.some((e) => e.instancePath === '/assessment/temperature')).toBe(true);
  });

  it('enforces enum values (avpu)', () => {
    const bad = {
      ...rrtSbarSampleCompleted,
      assessment: { ...(rrtSbarSampleCompleted.assessment as object), avpu: 'SLEEPY' },
    };
    expect(validateData(dataSchema, bad).valid).toBe(false);
  });

  it('enforces numeric bounds (spo2 <= 100)', () => {
    const bad = {
      ...rrtSbarSampleCompleted,
      assessment: { ...(rrtSbarSampleCompleted.assessment as object), spo2: 140 },
    };
    expect(validateData(dataSchema, bad).valid).toBe(false);
  });

  it('resolves $ref/$defs (anticoagulantUse must be YES|NO)', () => {
    const bad = { ...rrtSbarSampleCompleted, anticoagulantUse: 'MAYBE' };
    expect(validateData(dataSchema, bad).valid).toBe(false);
  });

  describe('if/then conditional — low SpO2 requires a recommendation', () => {
    const base = { callDetails: { date: '2026-07-24' } };

    it('is INVALID when spo2 <= 91 and recommendation is missing', () => {
      const data = { ...base, assessment: { spo2: 88 } };
      const result = validateData(dataSchema, data);
      expect(result.valid).toBe(false);
    });

    it('is VALID once a recommendation is provided', () => {
      const data = {
        ...base,
        assessment: { spo2: 88 },
        recommendation: 'Escalate to ICU; start oxygen.',
      };
      expect(validateData(dataSchema, data).valid).toBe(true);
    });

    it('does NOT require a recommendation when spo2 is normal', () => {
      const data = { ...base, assessment: { spo2: 98 } };
      expect(validateData(dataSchema, data).valid).toBe(true);
    });
  });

  it('required top-level callDetails is enforced (empty sample lacks required date)', () => {
    // The empty draft is intentionally not submit-valid: callDetails.date is required.
    expect(validateData(dataSchema, {}).valid).toBe(false);
    expect(validateData(dataSchema, rrtSbarSampleEmpty).valid).toBe(false);
  });
});
