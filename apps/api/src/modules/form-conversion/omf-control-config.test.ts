import { describe, it, expect } from 'vitest';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

/**
 * MISSING_CONTROL_CONFIG warnings: a config-driven omf control the AI emitted
 * without the omf config it draws from renders an empty shell (the transfer-form
 * checklistMatrix regression), and an enum-driven control bound to a schema
 * with no options renders no inputs. The assembler must surface each as a
 * warning against its binding — never silently persist an empty control.
 */

const service = new JsonFormsAssemblerService(new SchemaValidationService());

function assembleWith(
  properties: Record<string, unknown>,
  elements: unknown[],
): { type: string; message: string; binding?: string }[] {
  const output = JSON.stringify({
    dataSchema: { type: 'object', properties, additionalProperties: false },
    uiSchema: { schemaVersion: '1.0', layout: { type: 'VerticalLayout', elements } },
    conversionMetadata: { formTitle: 'T', fields: [], warnings: [] },
  });
  return service.assemble(output).warnings.filter((w) => w.type === 'MISSING_CONTROL_CONFIG');
}

const optionArray = {
  type: 'array',
  uniqueItems: true,
  items: { type: 'string', oneOf: [{ const: 'HBV', title: 'HBV' }] },
};

describe('MISSING_CONTROL_CONFIG validation', () => {
  it('flags a checklistMatrix with no rows/columns, steering an option array to checkboxGroup', () => {
    const warnings = assembleWith({ bloodborne: optionArray }, [
      {
        type: 'Control',
        scope: '#/properties/bloodborne',
        options: { omf: { control: 'checklistMatrix' } },
      },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].binding).toBe('#/properties/bloodborne');
    expect(warnings[0].message).toContain('checkboxGroup');
  });

  it('flags a checklistMatrix with no config on a non-option schema as rendering empty', () => {
    const warnings = assembleWith({ grid: { type: 'object' } }, [
      { type: 'Control', scope: '#/properties/grid', options: { omf: { control: 'checklistMatrix' } } },
    ]);
    expect(warnings).toHaveLength(1);
    expect(warnings[0].message).toContain('no checkboxes');
  });

  it('accepts a fully configured checklistMatrix', () => {
    const warnings = assembleWith({ grid: { type: 'object' } }, [
      {
        type: 'Control',
        scope: '#/properties/grid',
        options: {
          omf: {
            control: 'checklistMatrix',
            rows: [{ key: 'r1', label: 'Row' }],
            columns: [{ key: 'day1', label: 'Day 1' }],
          },
        },
      },
    ]);
    expect(warnings).toHaveLength(0);
  });

  it('flags a scoringMatrix with no domains, and one whose domains have no items', () => {
    const noDomains = assembleWith({ score: { type: 'number' } }, [
      { type: 'Control', scope: '#/properties/score', options: { omf: { control: 'scoringMatrix' } } },
    ]);
    expect(noDomains).toHaveLength(1);
    expect(noDomains[0].message).toContain('no omf.domains');

    const emptyDomain = assembleWith({ score: { type: 'number' } }, [
      {
        type: 'Control',
        scope: '#/properties/score',
        options: {
          omf: {
            control: 'scoringMatrix',
            domains: [{ name: 'CARDIOVASCULAR', items: [] }],
          },
        },
      },
    ]);
    expect(emptyDomain).toHaveLength(1);
    expect(emptyDomain[0].message).toContain('1 domain(s) with no items');
  });

  it('flags unconfigured vitalSignsChart, colorCodedGrid, clinicalReferenceTable and recordTable', () => {
    const warnings = assembleWith(
      {
        vitals: { type: 'array', items: { type: 'object' } },
        grid: { type: 'object' },
        ref: { type: 'object' },
        log: { type: 'array', items: { type: 'object' } },
      },
      [
        { type: 'Control', scope: '#/properties/vitals', options: { omf: { control: 'vitalSignsChart' } } },
        { type: 'Control', scope: '#/properties/grid', options: { omf: { control: 'colorCodedGrid' } } },
        { type: 'Control', scope: '#/properties/ref', options: { omf: { control: 'clinicalReferenceTable' } } },
        { type: 'Control', scope: '#/properties/log', options: { omf: { control: 'recordTable' } } },
      ],
    );
    expect(warnings.map((w) => w.binding)).toEqual([
      '#/properties/vitals',
      '#/properties/grid',
      '#/properties/ref',
      '#/properties/log',
    ]);
  });

  it('flags enum-driven controls whose schema carries no options', () => {
    const warnings = assembleWith(
      {
        choice: { type: 'string' },
        multi: { type: 'array', items: { type: 'string' } },
      },
      [
        { type: 'Control', scope: '#/properties/choice', options: { omf: { control: 'radio' } } },
        { type: 'Control', scope: '#/properties/multi', options: { omf: { control: 'checkboxGroup' } } },
      ],
    );
    expect(warnings).toHaveLength(2);
    expect(warnings[0].message).toContain('no enum/oneOf');
    expect(warnings[1].message).toContain('enum/oneOf options');
  });

  it('accepts well-formed radio and checkboxGroup controls, including nested in groups', () => {
    const warnings = assembleWith(
      {
        yesNo: { type: 'string', oneOf: [{ const: 'YES', title: 'Yes' }] },
        multi: optionArray,
      },
      [
        {
          type: 'Group',
          label: 'Section',
          elements: [
            { type: 'Control', scope: '#/properties/yesNo', options: { omf: { control: 'radio' } } },
            { type: 'Control', scope: '#/properties/multi', options: { omf: { control: 'checkboxGroup' } } },
          ],
        },
      ],
    );
    expect(warnings).toHaveLength(0);
  });

  it('leaves controls without an omf.control untouched', () => {
    const warnings = assembleWith({ name: { type: 'string' } }, [
      { type: 'Control', scope: '#/properties/name' },
    ]);
    expect(warnings).toHaveLength(0);
  });
});
