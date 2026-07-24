/**
 * Data validation against a JSON Schema Draft 2020-12 Data Schema, via Ajv.
 *
 * Phase 1 scope: correctness of validation for the jsonforms engine. A later
 * phase adds schema compilation caching, $ref-registry wiring, and translated
 * error messages; for now each call compiles fresh (correct, if not optimal).
 */

import Ajv2020, { type ErrorObject } from 'ajv/dist/2020';
import addFormats from 'ajv-formats';
import type { JsonSchema } from '@openmedform/form-schema-types';

export interface ValidationError {
  /** JSON pointer to the offending value, e.g. '/assessment/spo2'. */
  instancePath: string;
  /** Ajv keyword that failed, e.g. 'required', 'maximum', 'type'. */
  keyword: string;
  message: string;
  params: Record<string, unknown>;
}

export interface ValidationResult {
  valid: boolean;
  errors: ValidationError[];
}

/** Create an Ajv 2020-12 instance configured for the platform's schemas. */
export function createAjv(): Ajv2020 {
  const ajv = new Ajv2020({
    allErrors: true,
    // Data Schemas carry annotation keywords (readOnly, title, etc.) and are
    // author/AI-generated; strict mode would reject harmless constructs.
    strict: false,
  });
  addFormats(ajv);
  return ajv;
}

function toValidationErrors(errors: ErrorObject[] | null | undefined): ValidationError[] {
  return (errors ?? []).map((e) => ({
    instancePath: e.instancePath,
    keyword: e.keyword,
    message: e.message ?? '',
    params: e.params as Record<string, unknown>,
  }));
}

/**
 * Validate a response object against a Data Schema.
 * Throws only if the schema itself is not compilable.
 */
export function validateData(
  dataSchema: JsonSchema,
  data: unknown,
): ValidationResult {
  const ajv = createAjv();
  const validate = ajv.compile(dataSchema as object);
  const valid = validate(data) as boolean;
  return { valid, errors: valid ? [] : toValidationErrors(validate.errors) };
}

/**
 * Assert that a Data Schema compiles under Ajv 2020-12. Returns null on success
 * or an error message describing why compilation failed.
 */
export function checkSchemaCompiles(dataSchema: JsonSchema): string | null {
  try {
    createAjv().compile(dataSchema as object);
    return null;
  } catch (err) {
    return err instanceof Error ? err.message : String(err);
  }
}
