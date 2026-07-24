/**
 * Response serialization — building an empty draft, pruning, and preparing a
 * response for submission.
 *
 * - `createEmptyResponse` seeds the shape a new FormInstance draft starts with,
 *   applying schema `default`s (opt-out) and nesting object properties.
 * - `pruneEmptyValues` strips undefined/null/empty-string leaves and empty
 *   objects so drafts and submissions stay compact.
 * - `serializeForSubmit` prunes then validates against the Data Schema, yielding
 *   the payload plus the validation verdict the backend re-checks server-side.
 *
 * Framework-independent: pure functions, Ajv via validate-data.
 */

import type { JsonSchema } from '@openmedform/form-schema-types';
import { validateData, type ValidationError } from '../validation/validate-data';
import { derefSchema } from '../schema/pointer';

export interface CreateEmptyOptions {
  /** Apply schema `default` values (default true). */
  applyDefaults?: boolean;
}

function firstType(schema: JsonSchema): string | undefined {
  return Array.isArray(schema.type) ? schema.type[0] : schema.type;
}

function buildEmpty(
  schema: JsonSchema | undefined,
  root: JsonSchema,
  applyDefaults: boolean,
): unknown {
  const resolved = derefSchema(schema, root);
  if (!resolved) return undefined;

  if (applyDefaults && resolved.default !== undefined) {
    return resolved.default;
  }

  if (firstType(resolved) === 'object' && resolved.properties) {
    const obj: Record<string, unknown> = {};
    for (const [key, propSchema] of Object.entries(resolved.properties)) {
      const value = buildEmpty(propSchema, root, applyDefaults);
      if (value !== undefined) obj[key] = value;
    }
    return obj;
  }

  // Leaves with no default remain absent; the object nesting is what a fresh
  // draft needs, not placeholder scalar values.
  return undefined;
}

/** Build the empty draft response for a Data Schema. */
export function createEmptyResponse(
  dataSchema: JsonSchema,
  options: CreateEmptyOptions = {},
): Record<string, unknown> {
  const applyDefaults = options.applyDefaults ?? true;
  const result = buildEmpty(dataSchema, dataSchema, applyDefaults);
  return result && typeof result === 'object' ? (result as Record<string, unknown>) : {};
}

function isEmptyLeaf(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

/**
 * Recursively remove empty leaves and empty objects. Arrays are pruned
 * element-wise but never dropped (an empty array can be meaningful). Booleans,
 * zero, and other falsy-but-real values are preserved.
 */
export function pruneEmptyValues(data: unknown): unknown {
  if (Array.isArray(data)) {
    return data.map((item) => pruneEmptyValues(item));
  }
  if (data && typeof data === 'object') {
    const out: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(data as Record<string, unknown>)) {
      const pruned = pruneEmptyValues(value);
      if (isEmptyLeaf(pruned)) continue;
      if (
        pruned &&
        typeof pruned === 'object' &&
        !Array.isArray(pruned) &&
        Object.keys(pruned).length === 0
      ) {
        continue; // drop objects that became empty after pruning
      }
      out[key] = pruned;
    }
    return out;
  }
  return data;
}

export interface SubmitSerialization {
  valid: boolean;
  errors: ValidationError[];
  /** The pruned payload actually submitted. */
  response: Record<string, unknown>;
}

/**
 * Prepare a response for submission: prune (unless disabled) and validate
 * against the Data Schema. The verdict here is advisory — the server always
 * re-validates — but lets the client block obviously invalid submits.
 */
export function serializeForSubmit(
  dataSchema: JsonSchema,
  data: Record<string, unknown>,
  options: { prune?: boolean } = {},
): SubmitSerialization {
  const response = (
    options.prune === false ? data : pruneEmptyValues(data)
  ) as Record<string, unknown>;
  const { valid, errors } = validateData(dataSchema, response);
  return { valid, errors, response };
}
