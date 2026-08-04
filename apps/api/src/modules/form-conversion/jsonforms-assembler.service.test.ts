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

  it('repairs a dangling $ref instead of hard-failing the whole conversion', () => {
    const out = JSON.stringify({
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          // References a $def the model never defined — used to crash Ajv compile.
          age: { $ref: '#/$defs/age', title: 'Age band' },
          spo2: { type: 'integer', minimum: 0, maximum: 100 },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/age' },
            { type: 'Control', scope: '#/properties/spo2' },
          ],
        },
      },
    });

    const r = service.assemble(out);
    // The dangling $ref is stripped; the field keeps its sibling title.
    const age = (r.dataSchema.properties as Record<string, Record<string, unknown>>).age;
    expect(age.$ref).toBeUndefined();
    expect(age.title).toBe('Age band');
    // A warning surfaces the repair for the reviewer.
    const w = r.warnings.find((x) => x.type === 'UNCERTAIN_FIELD_BINDING');
    expect(w?.message).toContain('#/$defs/age');
  });

  it('keeps a $ref that resolves to a real $def', () => {
    const out = JSON.stringify({
      dataSchema: {
        type: 'object',
        $defs: { yesNo: { type: 'string', enum: ['YES', 'NO'] } },
        properties: { chf: { $ref: '#/$defs/yesNo', title: 'CHF' } },
      },
      uiSchema: { schemaVersion: '1.0', layout: { type: 'Control', scope: '#/properties/chf' } },
    });
    const r = service.assemble(out);
    const chf = (r.dataSchema.properties as Record<string, Record<string, unknown>>).chf;
    expect(chf.$ref).toBe('#/$defs/yesNo');
    expect(r.warnings.some((x) => x.type === 'UNCERTAIN_FIELD_BINDING')).toBe(false);
  });

  it('derives sum + threshold scoring rules from omf.points and scoreSummary bands', () => {
    const out = JSON.stringify({
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          age: {
            type: 'object',
            additionalProperties: false,
            properties: { age75plus: { type: 'boolean', title: 'Age ≥75' } },
          },
          cardiovascular: {
            type: 'object',
            additionalProperties: false,
            properties: { acuteMI: { type: 'boolean', title: 'Acute MI' } },
          },
          totalScore: { type: 'number' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Group',
              label: 'AGE',
              elements: [
                { type: 'Control', scope: '#/properties/age/properties/age75plus', options: { omf: { points: 3 } } },
              ],
            },
            {
              type: 'Group',
              label: 'CARDIOVASCULAR',
              elements: [
                { type: 'Control', scope: '#/properties/cardiovascular/properties/acuteMI', options: { omf: { points: 1 } } },
              ],
            },
            {
              type: 'Control',
              scope: '#/properties/totalScore',
              options: {
                omf: {
                  control: 'scoreSummary',
                  bands: [
                    { maxScore: 1, label: 'Low', color: '#1e8e5a' },
                    { minScore: 2, maxScore: 4, label: 'Moderate' },
                    { minScore: 5, label: 'High' },
                  ],
                },
              },
            },
          ],
        },
      },
    });

    const r = service.assemble(out);
    const rules = r.scoringRules as {
      totalScore: { type: string; items: Array<{ field: string; points: number }> };
      riskLevel: { type: string; scoreField: string; thresholds: Array<{ max: number; label: string }> };
    };
    expect(rules.totalScore.type).toBe('sum');
    expect(rules.totalScore.items).toEqual([
      { field: 'age.age75plus', points: 3 },
      { field: 'cardiovascular.acuteMI', points: 1 },
    ]);
    expect(rules.riskLevel).toMatchObject({ type: 'threshold', scoreField: 'totalScore' });
    // Bands sorted ascending by max; open-ended top band gets a large ceiling.
    expect(rules.riskLevel.thresholds.map((t) => t.label)).toEqual(['Low', 'Moderate', 'High']);
    expect(rules.riskLevel.thresholds[2].max).toBeGreaterThan(1000);
  });

  it('emits no scoring rules when no control carries omf.points', () => {
    expect(service.assemble(goodOutput).scoringRules).toEqual({});
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

describe('changeSummary passthrough', () => {
  const base = {
    dataSchema: { type: 'object', properties: { a: { type: 'string' } } },
    uiSchema: { type: 'VerticalLayout', elements: [] },
    printSchema: {},
    translations: {},
    conversionMetadata: {},
  };

  it('carries a non-empty summary through, trimmed and bounded', () => {
    const out = makeService().assemble(
      JSON.stringify({ ...base, changeSummary: '  Renamed a field.  ' }),
    );
    expect(out.changeSummary).toBe('Renamed a field.');

    const long = makeService().assemble(
      JSON.stringify({ ...base, changeSummary: 'x'.repeat(5000) }),
    );
    expect(long.changeSummary).toHaveLength(2000);
  });

  it('yields none for a missing, empty, or non-string summary', () => {
    expect(makeService().assemble(JSON.stringify(base)).changeSummary).toBeUndefined();
    expect(
      makeService().assemble(JSON.stringify({ ...base, changeSummary: '   ' })).changeSummary,
    ).toBeUndefined();
    expect(
      makeService().assemble(JSON.stringify({ ...base, changeSummary: 42 })).changeSummary,
    ).toBeUndefined();
  });
});

