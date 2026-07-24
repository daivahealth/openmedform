import { describe, it, expect } from 'vitest';
import {
  scopeToSchemaSegments,
  scopeToDataPathSegments,
  scopeToDataPath,
  resolveRef,
  resolveSchemaAtScope,
} from './pointer';
import { rrtSbarReference } from '../fixtures/rrt-sbar.reference';

const dataSchema = rrtSbarReference.dataSchema;

describe('scope → segments', () => {
  it('splits a schema scope, dropping the leading #', () => {
    expect(scopeToSchemaSegments('#/properties/callDetails/properties/date')).toEqual([
      'properties',
      'callDetails',
      'properties',
      'date',
    ]);
  });

  it('reduces a scope to its data-path property names (JSON Forms semantics)', () => {
    expect(
      scopeToDataPathSegments('#/properties/assessment/properties/spo2'),
    ).toEqual(['assessment', 'spo2']);
    expect(scopeToDataPath('#/properties/situation')).toBe('situation');
  });

  it('handles ~0/~1 escapes in pointer segments', () => {
    expect(scopeToSchemaSegments('#/properties/a~1b')).toEqual(['properties', 'a/b']);
  });
});

describe('resolveRef', () => {
  it('resolves a local $defs ref', () => {
    expect(resolveRef(dataSchema, '#/$defs/yesNo')).toEqual({
      type: 'string',
      enum: ['YES', 'NO'],
    });
  });

  it('returns undefined for external refs', () => {
    expect(resolveRef(dataSchema, 'https://example.com/x')).toBeUndefined();
  });
});

describe('resolveSchemaAtScope', () => {
  it('resolves a nested control scope to its leaf schema', () => {
    const schema = resolveSchemaAtScope(
      dataSchema,
      '#/properties/assessment/properties/spo2',
    );
    expect(schema).toMatchObject({ type: 'integer', minimum: 0, maximum: 100 });
  });

  it('dereferences a $ref at the target scope', () => {
    const schema = resolveSchemaAtScope(dataSchema, '#/properties/anticoagulantUse');
    expect(schema).toEqual({ type: 'string', enum: ['YES', 'NO'] });
  });

  it('returns undefined for an unknown scope', () => {
    expect(resolveSchemaAtScope(dataSchema, '#/properties/nope')).toBeUndefined();
  });
});
