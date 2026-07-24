import { describe, it, expect, beforeEach } from 'vitest';
import { SchemaValidationService } from './schema-validation.service';

const dataSchema = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  type: 'object',
  $defs: { yesNo: { type: 'string', enum: ['YES', 'NO'] } },
  properties: {
    spo2: { type: 'integer', minimum: 0, maximum: 100 },
    anticoagulantUse: { $ref: '#/$defs/yesNo' },
    recommendation: { type: 'string' },
  },
  required: ['spo2'],
  allOf: [
    {
      if: {
        properties: { spo2: { type: 'integer', maximum: 91 } },
        required: ['spo2'],
      },
      then: { required: ['recommendation'] },
    },
  ],
  additionalProperties: false,
};

describe('SchemaValidationService (Draft 2020-12)', () => {
  let service: SchemaValidationService;
  beforeEach(() => {
    service = new SchemaValidationService();
  });

  it('accepts a valid payload', () => {
    const r = service.validate(dataSchema, { spo2: 98, anticoagulantUse: 'YES' });
    expect(r.valid).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it('rejects an out-of-range value and reports the path', () => {
    const r = service.validate(dataSchema, { spo2: 140 });
    expect(r.valid).toBe(false);
    expect(r.errors.some((e) => e.instancePath === '/spo2')).toBe(true);
  });

  it('resolves $ref/$defs (enum enforced)', () => {
    expect(service.validate(dataSchema, { spo2: 90, anticoagulantUse: 'MAYBE', recommendation: 'x' }).valid).toBe(false);
  });

  it('enforces if/then (low spo2 requires a recommendation)', () => {
    expect(service.validate(dataSchema, { spo2: 88 }).valid).toBe(false);
    expect(service.validate(dataSchema, { spo2: 88, recommendation: 'Escalate' }).valid).toBe(true);
  });

  it('returns an invalid result (not a throw) for an uncompilable schema', () => {
    const r = service.validate({ type: 'not-a-type' }, {});
    expect(r.valid).toBe(false);
    expect(r.errors[0].keyword).toBe('schema');
  });
});
