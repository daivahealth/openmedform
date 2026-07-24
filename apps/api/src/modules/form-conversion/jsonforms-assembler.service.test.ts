import { describe, it, expect, beforeEach } from 'vitest';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

function makeService() {
  return new JsonFormsAssemblerService(new SchemaValidationService());
}

const goodOutput = JSON.stringify({
  dataSchema: {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    type: 'object',
    properties: { spo2: { type: 'integer', minimum: 0, maximum: 100 } },
    required: ['spo2'],
    additionalProperties: false,
  },
  uiSchema: {
    schemaVersion: '1.0',
    layout: {
      type: 'VerticalLayout',
      elements: [{ type: 'Control', scope: '#/properties/spo2' }],
    },
  },
  conversionMetadata: {
    formTitle: 'Test',
    fields: [
      {
        binding: '#/properties/spo2',
        sourcePage: 1,
        confidence: 0.55,
        warnings: [{ type: 'AMBIGUOUS_FIELD_TYPE', message: 'number vs integer?' }],
      },
    ],
    warnings: [{ type: 'POTENTIAL_MISSING_FIELD', message: 'footer table maybe dropped', sourcePage: 2 }],
  },
});

describe('JsonFormsAssemblerService', () => {
  let service: JsonFormsAssemblerService;
  beforeEach(() => {
    service = makeService();
  });

  it('assembles the four artifacts and defaults print/translations', () => {
    const r = service.assemble(goodOutput);
    expect(r.dataSchema.type).toBe('object');
    expect((r.uiSchema.layout as { type: string }).type).toBe('VerticalLayout');
    expect(r.printSchema.pageSize).toBe('A4');
    expect(r.translations).toMatchObject({ defaultLanguage: 'en' });
  });

  it('flattens field + form warnings, inheriting field binding/page/confidence', () => {
    const r = service.assemble(goodOutput);
    expect(r.warnings).toHaveLength(2);
    const field = r.warnings.find((w) => w.type === 'AMBIGUOUS_FIELD_TYPE');
    expect(field?.binding).toBe('#/properties/spo2');
    expect(field?.confidence).toBe(0.55);
    const form = r.warnings.find((w) => w.type === 'POTENTIAL_MISSING_FIELD');
    expect(form?.sourcePage).toBe(2);
  });

  it('strips markdown fences before parsing', () => {
    const fenced = '```json\n' + goodOutput + '\n```';
    expect(() => service.assemble(fenced)).not.toThrow();
  });

  it('wraps a bare root layout element into a UI schema', () => {
    const out = JSON.stringify({
      dataSchema: { type: 'object', properties: { a: { type: 'string' } } },
      uiSchema: { type: 'VerticalLayout', elements: [] },
    });
    expect(service.assemble(out).uiSchema.schemaVersion).toBe('1.0');
  });

  it('rejects a nested Control scope that omits the JSON Schema properties segment', () => {
    const out = JSON.stringify({
      dataSchema: {
        type: 'object',
        properties: {
          reasonForCall: {
            type: 'object',
            properties: { pulseLessThan40: { type: 'boolean' } },
          },
        },
      },
      uiSchema: {
        layout: {
          type: 'Control',
          scope: '#/properties/reasonForCall/pulseLessThan40',
        },
      },
    });

    expect(() => service.assemble(out)).toThrow(/Control scope that does not resolve/);
  });

  it('accepts a nested Control scope with properties at every object level', () => {
    const out = JSON.stringify({
      dataSchema: {
        type: 'object',
        properties: {
          reasonForCall: {
            type: 'object',
            properties: { pulseLessThan40: { type: 'boolean' } },
          },
        },
      },
      uiSchema: {
        layout: {
          type: 'Control',
          scope: '#/properties/reasonForCall/properties/pulseLessThan40',
        },
      },
    });

    expect(() => service.assemble(out)).not.toThrow();
  });

  it('rejects a Data Schema that does not compile', () => {
    const bad = JSON.stringify({ dataSchema: { type: 'nonsense' }, uiSchema: {} });
    expect(() => service.assemble(bad)).toThrow(/does not compile/);
  });

  it('rejects non-JSON output', () => {
    expect(() => service.assemble('the model refused')).toThrow(/not valid JSON/);
  });
});
