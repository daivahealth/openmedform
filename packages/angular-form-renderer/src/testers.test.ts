import { describe, it, expect } from 'vitest';
import type { UISchemaElement } from '@jsonforms/core';
import {
  omfControlIs,
  readOmf,
  OMF_CONTROL_RANK,
  STANDARD_RANK,
  recordTableTester,
  checkboxGroupTester,
  omfTabsTester,
  enumControlTester,
  textControlTester,
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

  // The multi-select checkbox group. The fallback half must claim an enum-array
  // even when the AI labeled it `checklistMatrix` — an unconfigured matrix
  // renders an empty grid, which is exactly the failure this tester prevents.
  it('checkboxGroupTester claims an explicit checkboxGroup', () => {
    expect(checkboxGroupTester(withOmf('checkboxGroup'), {} as never, undefined as never)).toBe(
      OMF_CONTROL_RANK + 1,
    );
  });

  it('checkboxGroupTester claims any enum/oneOf array, beating checklistMatrix', () => {
    const schema = {
      type: 'object',
      properties: {
        x: {
          type: 'array',
          uniqueItems: true,
          items: { type: 'string', oneOf: [{ const: 'HBV', title: 'HBV' }] },
        },
      },
    };
    const el = {
      type: 'Control',
      scope: '#/properties/x',
      options: { omf: { control: 'checklistMatrix' } },
    } as unknown as UISchemaElement;
    const rank = checkboxGroupTester(el, schema as never, { rootSchema: schema, config: {} } as never);
    expect(rank).toBe(OMF_CONTROL_RANK + 1);
    expect(rank).toBeGreaterThan(OMF_CONTROL_RANK);
  });

  it('checkboxGroupTester ignores object arrays and plain strings', () => {
    const schema = {
      type: 'object',
      properties: {
        records: { type: 'array', items: { type: 'object', properties: {} } },
        name: { type: 'string' },
      },
    };
    const ctx = { rootSchema: schema, config: {} } as never;
    const records = { type: 'Control', scope: '#/properties/records' } as UISchemaElement;
    const name = { type: 'Control', scope: '#/properties/name' } as UISchemaElement;
    expect(checkboxGroupTester(records, schema as never, ctx)).toBe(-1);
    expect(checkboxGroupTester(name, schema as never, ctx)).toBe(-1);
  });

  it('omfTabsTester claims OmfTabsLayout only', () => {
    const tabs = { type: 'OmfTabsLayout', elements: [] } as unknown as UISchemaElement;
    const vertical = { type: 'VerticalLayout', elements: [] } as unknown as UISchemaElement;
    expect(omfTabsTester(tabs, {} as never, undefined as never)).toBe(STANDARD_RANK);
    expect(omfTabsTester(vertical, {} as never, undefined as never)).toBe(-1);
  });
});

describe('a oneOf enum reaches the select, not the text input', () => {
  /**
   * React had this wrong: `{ type: 'string', oneOf: [...] }` matched the
   * string-input tester and the select tester at the SAME rank, and the input
   * won, so the field rendered as an empty text box. Angular is safe because
   * its enum tester is ranked one above the text control — asserted here so it
   * stays that way rather than being safe by accident.
   */
  const control = { type: 'Control', scope: '#/properties/gait' } as unknown as UISchemaElement;
  const rootSchema = {
    type: 'object',
    properties: {
      gait: {
        type: 'string',
        oneOf: [
          { const: 'WEAK', title: 'Weak' },
          { const: 'IMPAIRED', title: 'Impaired' },
        ],
      },
    },
  };

  it('ranks the enum control above the text control for the same schema', () => {
    const enumRank = enumControlTester(control, rootSchema, { rootSchema, config: {} } as never);
    const textRank = textControlTester(control, rootSchema, { rootSchema, config: {} } as never);

    expect(enumRank).toBeGreaterThan(-1);
    expect(enumRank).toBeGreaterThan(textRank);
  });
});
