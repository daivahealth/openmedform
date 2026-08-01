import { describe, it, expect } from 'vitest';
import type { UISchemaElement } from '@jsonforms/core';
import {
  omfControlIs,
  readOmf,
  OMF_CONTROL_RANK,
  STANDARD_RANK,
  recordTableTester,
  omfTabsTester,
} from './testers';

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

  // The repeating encounter log. Selection is the Angular-specific risk here:
  // the rendering itself is proven in the React suite and the summary-cell
  // logic in form-core, but if these testers do not win, an EMR silently falls
  // back to the generic array widget the control exists to replace.
  it('recordTableTester claims a control marked omf.control = recordTable', () => {
    const el = {
      type: 'Control',
      scope: '#/properties/treatmentDays',
      options: { omf: { control: 'recordTable' } },
    } as unknown as UISchemaElement;
    expect(recordTableTester(el, {} as never, undefined as never)).toBe(OMF_CONTROL_RANK);
    expect(recordTableTester(el, {} as never, undefined as never)).toBeGreaterThan(STANDARD_RANK);
  });

  it('recordTableTester ignores an ordinary control', () => {
    const plain = { type: 'Control', scope: '#/properties/name' } as UISchemaElement;
    expect(recordTableTester(plain, {} as never, undefined as never)).toBe(-1);
  });

  it('omfTabsTester claims OmfTabsLayout only', () => {
    const tabs = { type: 'OmfTabsLayout', elements: [] } as unknown as UISchemaElement;
    const vertical = { type: 'VerticalLayout', elements: [] } as unknown as UISchemaElement;
    expect(omfTabsTester(tabs, {} as never, undefined as never)).toBe(STANDARD_RANK);
    expect(omfTabsTester(vertical, {} as never, undefined as never)).toBe(-1);
  });
});
