/**
 * JSON pointer / JSON Forms scope resolution against a Data Schema.
 *
 * Two related-but-distinct paths are involved and must not be confused:
 *
 * - A **schema path** (JSON Forms "scope") walks the Data Schema structure and
 *   therefore includes the `properties`/`items`/`$defs` keyword segments,
 *   e.g. `#/properties/callDetails/properties/date`.
 * - A **data path** addresses a value inside a response object and contains
 *   only property names, e.g. `callDetails.date`.
 *
 * The mapping from scope → data path follows JSON Forms' own convention (keep
 * every other segment, dropping the keyword segments) so bindings match the
 * jsonforms renderers exactly.
 *
 * Framework-independent: pure functions over plain objects, no Angular/React.
 */

import type { JsonSchema } from '@openmedform/form-schema-types';

/** Decode a single JSON-pointer segment (`~1` → `/`, `~0` → `~`). */
export function decodePointerSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

/**
 * Split a scope/pointer into its schema-path segments, dropping the leading
 * `#`. `#/properties/a/properties/b` → `['properties','a','properties','b']`;
 * `#/$defs/yesNo` → `['$defs','yesNo']`.
 */
export function scopeToSchemaSegments(scope: string): string[] {
  return scope
    .replace(/^#/, '')
    .split('/')
    .filter((s) => s.length > 0)
    .map(decodePointerSegment);
}

/**
 * Convert a scope into the data-path property names it addresses, following
 * JSON Forms semantics: keep every other segment (the names) and drop the
 * keyword segments (`properties`, `items`, …).
 * `#/properties/assessment/properties/spo2` → `['assessment','spo2']`.
 */
export function scopeToDataPathSegments(scope: string): string[] {
  const segments = scopeToSchemaSegments(scope);
  const out: string[] = [];
  for (let i = 1; i < segments.length; i += 2) {
    out.push(segments[i]);
  }
  return out;
}

/** Dotted data path for a scope, e.g. `assessment.spo2`. */
export function scopeToDataPath(scope: string): string {
  return scopeToDataPathSegments(scope).join('.');
}

/** Walk raw schema segments without dereferencing (used to resolve `$ref`). */
function walkSegments(root: JsonSchema, segments: string[]): JsonSchema | undefined {
  let current: unknown = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as JsonSchema | undefined;
}

/**
 * Resolve a local `$ref` (e.g. `#/$defs/yesNo`) against the root schema.
 * Only same-document refs are supported; external refs return undefined.
 */
export function resolveRef(root: JsonSchema, ref: string): JsonSchema | undefined {
  if (!ref.startsWith('#')) return undefined;
  return walkSegments(root, scopeToSchemaSegments(ref));
}

/** Dereference a schema node one level if it is a `$ref`. */
export function derefSchema(
  schema: JsonSchema | undefined,
  root: JsonSchema,
): JsonSchema | undefined {
  if (schema && typeof schema.$ref === 'string') {
    return resolveRef(root, schema.$ref);
  }
  return schema;
}

/**
 * Resolve the sub-schema a scope points at, dereferencing `$ref` nodes
 * encountered along the way and at the target. Returns undefined if the scope
 * does not resolve.
 */
export function resolveSchemaAtScope(
  root: JsonSchema,
  scope: string,
): JsonSchema | undefined {
  const segments = scopeToSchemaSegments(scope);
  let current: JsonSchema | undefined = root;
  for (const segment of segments) {
    current = derefSchema(current, root);
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment] as JsonSchema | undefined;
  }
  return derefSchema(current, root);
}
