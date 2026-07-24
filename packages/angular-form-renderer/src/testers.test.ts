import { describe, it, expect } from 'vitest';
import type { UISchemaElement } from '@jsonforms/core';
import { omfControlIs, readOmf, OMF_CONTROL_RANK, STANDARD_RANK } from './testers';

const withOmf = (control: string): UISchemaElement =>
  ({ type: 'Control', scope: '#/properties/x', options: { omf: { control } } } as unknown as UISchemaElement);

describe('Angular renderer testers (shared contract with React)', () => {
  it('omfControlIs matches on options.omf.control', () => {
    expect(omfControlIs('textarea')(withOmf('textarea'))).toBe(true);
    expect(omfControlIs('textarea')(withOmf('radio'))).toBe(false);
    expect(omfControlIs('scoringMatrix')({ type: 'Control' } as UISchemaElement)).toBe(false);
  });

  it('readOmf returns the omf bag or undefined', () => {
    expect(readOmf(withOmf('radio'))).toEqual({ control: 'radio' });
    expect(readOmf({ type: 'VerticalLayout' } as UISchemaElement)).toBeUndefined();
  });

  it('custom controls outrank standard controls', () => {
    expect(OMF_CONTROL_RANK).toBeGreaterThan(STANDARD_RANK);
  });
});
