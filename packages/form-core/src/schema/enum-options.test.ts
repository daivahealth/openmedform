import { describe, expect, it } from 'vitest';

import type { UiSchemaElement } from '@openmedform/form-schema-types';
import { elementOptionPoints, resolveEnumOptions } from './enum-options';

const control = (omf: Record<string, unknown>): UiSchemaElement =>
  ({ type: 'Control', scope: '#/properties/x', options: { omf } }) as unknown as UiSchemaElement;

describe('resolveEnumOptions', () => {
  it('prefers oneOf titles', () => {
    const options = resolveEnumOptions({
      oneOf: [
        { const: 'NO', title: 'No' },
        { const: 'YES', title: 'Yes' },
      ],
    });

    expect(options).toEqual([
      { code: 'NO', label: 'No' },
      { code: 'YES', label: 'Yes' },
    ]);
  });

  it('falls back to omf.optionLabels for a plain enum', () => {
    const options = resolveEnumOptions(
      { enum: ['NONE_BEDREST_NURSE_ASSIST', 'CRUTCHES_CANE_WALKER', 'FURNITURE'] },
      control({ optionLabels: {
        NONE_BEDREST_NURSE_ASSIST: 'None/bedrest/nurse assist',
        CRUTCHES_CANE_WALKER: 'Crutches/Cane/Walker',
        FURNITURE: 'Furniture',
      } }),
    );

    expect(options.map((o) => o.label)).toEqual([
      'None/bedrest/nurse assist',
      'Crutches/Cane/Walker',
      'Furniture',
    ]);
  });

  it('shows the raw code when nothing names it', () => {
    // Visibly wrong beats invisibly empty — an author can see `NO_0` and fix it.
    expect(resolveEnumOptions({ enum: ['NO_0'] })).toEqual([{ code: 'NO_0', label: 'NO_0' }]);
  });

  it('attaches points to the options that have them', () => {
    const options = resolveEnumOptions(
      { enum: ['NO', 'YES'] },
      control({ optionPoints: { NO: 0, YES: 25 } }),
    );

    expect(options).toEqual([
      { code: 'NO', label: 'NO', points: 0 },
      { code: 'YES', label: 'YES', points: 25 },
    ]);
  });

  it('keeps schema order, since the source form has an order', () => {
    const options = resolveEnumOptions({ enum: ['C', 'A', 'B'] });
    expect(options.map((o) => o.code)).toEqual(['C', 'A', 'B']);
  });

  it('coerces numeric codes to strings so lookups line up', () => {
    expect(resolveEnumOptions({ enum: [0, 15] }).map((o) => o.code)).toEqual(['0', '15']);
  });

  it('returns nothing for a schema that is not a single-select', () => {
    expect(resolveEnumOptions({})).toEqual([]);
    expect(resolveEnumOptions(undefined)).toEqual([]);
  });

  it('ignores a oneOf branch with no const', () => {
    // A subschema branch used for validation, not an option list.
    const options = resolveEnumOptions({
      oneOf: [{ const: 'A', title: 'Alpha' }, { title: 'no const here' }],
    });
    expect(options).toEqual([{ code: 'A', label: 'Alpha' }]);
  });
});

describe('elementOptionPoints', () => {
  it('reads the map, and only a map', () => {
    expect(elementOptionPoints(control({ optionPoints: { YES: 25 } }))).toEqual({ YES: 25 });
    expect(elementOptionPoints(control({ optionPoints: [1, 2] }))).toBeUndefined();
    expect(elementOptionPoints(control({}))).toBeUndefined();
    expect(elementOptionPoints(undefined)).toBeUndefined();
  });
});
