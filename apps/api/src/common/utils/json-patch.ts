/**
 * A strict RFC 6902 JSON Patch applier for the diff-based refine path (#130).
 *
 * Hand-rolled rather than a dependency because STRICTNESS IS THE FEATURE: a
 * model-authored patch that misses its target must fail loudly so the caller
 * can fall back to a full re-emit — never half-apply. So this deliberately
 * refuses everything RFC 6902 refuses (bad pointers, removing what is not
 * there, out-of-range array indices) and additionally refuses `test` — a
 * failing test op means the model was patching a document other than the one
 * we hold, which is a fallback case, not a control-flow feature.
 *
 * The input document is never mutated: apply works on a structured clone and
 * returns it, so a failed patch leaves the caller's artifacts untouched.
 */

export interface JsonPatchOperation {
  op: 'add' | 'replace' | 'remove' | 'move' | 'copy';
  path: string;
  /** add / replace / copy-move targets. */
  value?: unknown;
  /** move / copy source. */
  from?: string;
}

export class JsonPatchError extends Error {
  constructor(
    message: string,
    /** Index of the failing operation, for a debuggable log line. */
    readonly opIndex: number,
  ) {
    super(`Patch operation ${opIndex}: ${message}`);
    this.name = 'JsonPatchError';
  }
}

/** RFC 6901: `~1` → `/`, `~0` → `~`, in that order. */
function unescapeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function parsePointer(pointer: string, opIndex: number): string[] {
  if (pointer === '') return [];
  if (!pointer.startsWith('/')) {
    throw new JsonPatchError(`pointer "${pointer}" must start with "/"`, opIndex);
  }
  return pointer.slice(1).split('/').map(unescapeSegment);
}

interface Located {
  parent: Record<string, unknown> | unknown[];
  key: string;
}

/** Walk to the pointer's parent container; every intermediate must exist. */
function locate(document: unknown, segments: string[], pointer: string, opIndex: number): Located {
  if (segments.length === 0) {
    throw new JsonPatchError('the whole-document pointer "" is not supported here', opIndex);
  }
  let current: unknown = document;
  for (const segment of segments.slice(0, -1)) {
    if (Array.isArray(current)) {
      const index = toArrayIndex(segment, current.length, false, pointer, opIndex);
      current = current[index];
    } else if (current !== null && typeof current === 'object') {
      if (!(segment in (current as Record<string, unknown>))) {
        throw new JsonPatchError(`path "${pointer}" does not exist at "${segment}"`, opIndex);
      }
      current = (current as Record<string, unknown>)[segment];
    } else {
      throw new JsonPatchError(`path "${pointer}" traverses a non-container at "${segment}"`, opIndex);
    }
  }
  if (current === null || typeof current !== 'object') {
    throw new JsonPatchError(`parent of "${pointer}" is not an object or array`, opIndex);
  }
  return { parent: current as Located['parent'], key: segments[segments.length - 1] };
}

function toArrayIndex(
  segment: string,
  length: number,
  allowEnd: boolean,
  pointer: string,
  opIndex: number,
): number {
  if (segment === '-') {
    if (!allowEnd) {
      throw new JsonPatchError(`"-" is only valid when adding to "${pointer}"`, opIndex);
    }
    return length;
  }
  if (!/^(0|[1-9]\d*)$/.test(segment)) {
    throw new JsonPatchError(`"${segment}" is not a valid array index in "${pointer}"`, opIndex);
  }
  const index = Number(segment);
  const max = allowEnd ? length : length - 1;
  if (index > max) {
    throw new JsonPatchError(`index ${index} is out of range for "${pointer}" (length ${length})`, opIndex);
  }
  return index;
}

function getAt(document: unknown, pointer: string, opIndex: number): unknown {
  const { parent, key } = locate(document, parsePointer(pointer, opIndex), pointer, opIndex);
  if (Array.isArray(parent)) {
    return parent[toArrayIndex(key, parent.length, false, pointer, opIndex)];
  }
  if (!(key in parent)) {
    throw new JsonPatchError(`path "${pointer}" does not exist`, opIndex);
  }
  return parent[key];
}

function addAt(document: unknown, pointer: string, value: unknown, opIndex: number): void {
  const { parent, key } = locate(document, parsePointer(pointer, opIndex), pointer, opIndex);
  if (Array.isArray(parent)) {
    parent.splice(toArrayIndex(key, parent.length, true, pointer, opIndex), 0, value);
  } else {
    parent[key] = value;
  }
}

function replaceAt(document: unknown, pointer: string, value: unknown, opIndex: number): void {
  const { parent, key } = locate(document, parsePointer(pointer, opIndex), pointer, opIndex);
  if (Array.isArray(parent)) {
    parent[toArrayIndex(key, parent.length, false, pointer, opIndex)] = value;
  } else {
    if (!(key in parent)) {
      throw new JsonPatchError(`cannot replace "${pointer}": it does not exist (use add)`, opIndex);
    }
    parent[key] = value;
  }
}

function removeAt(document: unknown, pointer: string, opIndex: number): unknown {
  const { parent, key } = locate(document, parsePointer(pointer, opIndex), pointer, opIndex);
  if (Array.isArray(parent)) {
    const index = toArrayIndex(key, parent.length, false, pointer, opIndex);
    return parent.splice(index, 1)[0];
  }
  if (!(key in parent)) {
    throw new JsonPatchError(`cannot remove "${pointer}": it does not exist`, opIndex);
  }
  const removed = parent[key];
  delete parent[key];
  return removed;
}

/**
 * Apply operations in order to a CLONE of the document and return it. Throws
 * JsonPatchError on the first operation that does not apply exactly; the
 * original document is untouched either way.
 */
export function applyJsonPatch(document: unknown, operations: JsonPatchOperation[]): unknown {
  if (!Array.isArray(operations) || operations.length === 0) {
    throw new JsonPatchError('the patch has no operations', 0);
  }

  const result = structuredClone(document);

  operations.forEach((operation, i) => {
    if (!operation || typeof operation !== 'object' || typeof operation.path !== 'string') {
      throw new JsonPatchError('operation is not an object with a string path', i);
    }
    switch (operation.op) {
      case 'add':
        if (!('value' in operation)) throw new JsonPatchError('add requires a value', i);
        addAt(result, operation.path, operation.value, i);
        break;
      case 'replace':
        if (!('value' in operation)) throw new JsonPatchError('replace requires a value', i);
        replaceAt(result, operation.path, operation.value, i);
        break;
      case 'remove':
        removeAt(result, operation.path, i);
        break;
      case 'move': {
        if (typeof operation.from !== 'string') throw new JsonPatchError('move requires "from"', i);
        const value = removeAt(result, operation.from, i);
        addAt(result, operation.path, value, i);
        break;
      }
      case 'copy': {
        if (typeof operation.from !== 'string') throw new JsonPatchError('copy requires "from"', i);
        const value = structuredClone(getAt(result, operation.from, i));
        addAt(result, operation.path, value, i);
        break;
      }
      default:
        throw new JsonPatchError(`unsupported op "${String((operation as { op?: unknown }).op)}"`, i);
    }
  });

  return result;
}
