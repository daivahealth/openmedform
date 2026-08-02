import { describe, expect, it } from 'vitest';
import { JsonFormsAssemblerService } from './jsonforms-assembler.service';
import { SchemaValidationService } from '../validation/schema-validation.service';

const assembler = () => new JsonFormsAssemblerService(new SchemaValidationService());

const output = (dataSchema: unknown) =>
  JSON.stringify({
    dataSchema,
    uiSchema: { type: 'VerticalLayout', elements: [] },
    printSchema: {},
    translations: {},
    conversionMetadata: {},
  });

/**
 * Observed on a real conversion of the VIP chart: the model wrote `required`
 * INSIDE `properties`. Every value there must be a schema, so Ajv refused the
 * whole document and an otherwise good multi-section form was lost to one
 * misplaced keyword.
 */
describe('required nested inside properties', () => {
  it('relocates it instead of failing the conversion', () => {
    const result = assembler().assemble(
      output({
        type: 'object',
        properties: {
          site: { type: 'string' },
          side: { type: 'string' },
          required: ['site'],
        },
      }),
    );

    const schema = result.dataSchema as {
      required?: string[];
      properties: Record<string, unknown>;
    };
    expect(schema.required).toEqual(['site']);
    expect(schema.properties).not.toHaveProperty('required');
    expect(Object.keys(schema.properties)).toEqual(['site', 'side']);
  });

  it('says so in a warning, so the reviewer checks what is mandatory', () => {
    const { warnings } = assembler().assemble(
      output({ type: 'object', properties: { a: { type: 'string' }, required: ['a'] } }),
    );

    expect(warnings.some((w) => /Moved a "required" list/.test(w.message))).toBe(true);
  });

  it('repairs it at every nesting level', () => {
    // The real case had it in eight nested item schemas as well as the root.
    const result = assembler().assemble(
      output({
        type: 'object',
        properties: {
          cannulas: {
            type: 'array',
            items: {
              type: 'object',
              properties: { site: { type: 'string' }, required: ['site'] },
            },
          },
          required: ['cannulas'],
        },
      }),
    );

    const schema = result.dataSchema as Record<string, any>;
    expect(schema.required).toEqual(['cannulas']);
    expect(schema.properties.cannulas.items.required).toEqual(['site']);
    expect(schema.properties.cannulas.items.properties).not.toHaveProperty('required');
  });

  it('merges with a correct sibling list rather than replacing it', () => {
    // Dropping either list would silently relax validation.
    const result = assembler().assemble(
      output({
        type: 'object',
        required: ['a'],
        properties: { a: { type: 'string' }, b: { type: 'string' }, required: ['b'] },
      }),
    );

    expect(((result.dataSchema as { required: string[] }).required).sort()).toEqual(['a', 'b']);
  });

  it('drops names that do not match a declared property', () => {
    // Relocating must not introduce a required property that does not exist —
    // that would make every submission fail validation.
    const result = assembler().assemble(
      output({ type: 'object', properties: { a: { type: 'string' }, required: ['ghost'] } }),
    );

    expect(result.dataSchema).not.toHaveProperty('required');
  });

  it('leaves a field genuinely NAMED "required" alone', () => {
    // A real field is a schema, not an array of strings. Getting this wrong
    // would delete a field the form actually has.
    const result = assembler().assemble(
      output({
        type: 'object',
        properties: { required: { type: 'boolean', title: 'Required?' } },
      }),
    );

    const schema = result.dataSchema as { properties: Record<string, unknown> };
    expect(schema.properties.required).toEqual({ type: 'boolean', title: 'Required?' });
    expect(schema).not.toHaveProperty('required');
  });

  it('leaves a correct schema untouched', () => {
    const clean = {
      type: 'object',
      required: ['a'],
      properties: { a: { type: 'string' } },
    };

    const result = assembler().assemble(output(structuredClone(clean)));

    expect(result.dataSchema).toEqual(clean);
    expect(result.warnings.filter((w) => /Moved a "required"/.test(w.message))).toEqual([]);
  });
});
