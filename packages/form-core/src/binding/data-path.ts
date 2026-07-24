/**
 * Data binding — read and write response values by data path or UI scope.
 *
 * Writes are immutable: `setValueAtPath` returns a shallow-cloned copy along
 * the mutated branch, leaving the input untouched. This keeps the core safe to
 * use directly from React state and change-detection-based Angular alike.
 *
 * Framework-independent: plain objects only.
 */

import { scopeToDataPathSegments } from '../schema/pointer';

export type DataPath = string | string[];

/** Normalise a dotted string or segment array into segments. */
export function toPathSegments(path: DataPath): string[] {
  return Array.isArray(path) ? path : path.split('.').filter((s) => s.length > 0);
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Read the value at a data path; returns undefined if any segment is missing. */
export function getValueAtPath(data: unknown, path: DataPath): unknown {
  const segments = toPathSegments(path);
  let current: unknown = data;
  for (const segment of segments) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/**
 * Return a copy of `data` with `value` set at the data path. Intermediate
 * objects are created as needed; existing branches are shallow-cloned so the
 * original object is never mutated.
 */
export function setValueAtPath(
  data: Record<string, unknown> | undefined | null,
  path: DataPath,
  value: unknown,
): Record<string, unknown> {
  const segments = toPathSegments(path);
  const root: Record<string, unknown> = isPlainObject(data) ? { ...data } : {};
  if (segments.length === 0) return root;

  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    const next = isPlainObject(existing) ? { ...existing } : {};
    cursor[key] = next;
    cursor = next;
  }
  cursor[segments[segments.length - 1]] = value;
  return root;
}

/** Return a copy of `data` with the value at the data path removed. */
export function deleteValueAtPath(
  data: Record<string, unknown> | undefined | null,
  path: DataPath,
): Record<string, unknown> {
  const segments = toPathSegments(path);
  const root: Record<string, unknown> = isPlainObject(data) ? { ...data } : {};
  if (segments.length === 0) return root;

  let cursor = root;
  for (let i = 0; i < segments.length - 1; i++) {
    const key = segments[i];
    const existing = cursor[key];
    if (!isPlainObject(existing)) return root; // nothing to delete
    const next = { ...existing };
    cursor[key] = next;
    cursor = next;
  }
  delete cursor[segments[segments.length - 1]];
  return root;
}

/** Read the value a UI control scope binds to. */
export function getValueAtScope(data: unknown, scope: string): unknown {
  return getValueAtPath(data, scopeToDataPathSegments(scope));
}

/** Set the value a UI control scope binds to (immutable). */
export function setValueAtScope(
  data: Record<string, unknown> | undefined | null,
  scope: string,
  value: unknown,
): Record<string, unknown> {
  return setValueAtPath(data, scopeToDataPathSegments(scope), value);
}
