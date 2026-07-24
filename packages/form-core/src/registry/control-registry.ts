/**
 * Control registry — the framework-independent contract for mapping a UI schema
 * element to the renderer that should draw it.
 *
 * Both the React and Angular renderers register their own concrete renderer
 * objects (`R` is intentionally generic — a React component, an Angular
 * component class, or a print handler), but the *matching* logic lives here so
 * the two frameworks resolve the same element to the same conceptual control.
 *
 * Matching follows JSON Forms' tester/rank idea: every entry's tester scores an
 * element; the highest positive score wins. `NOT_APPLICABLE` (-1) means "this
 * entry cannot render the element".
 */

import type { JsonSchema, UiSchemaElement } from '@openmedform/form-schema-types';

/** Sentinel score meaning a tester does not apply to an element. */
export const NOT_APPLICABLE = -1;

/** Context a tester may consult (e.g. the resolved data schema for the field). */
export interface ControlContext {
  dataSchema?: JsonSchema;
  fieldSchema?: JsonSchema;
}

/** Scores how well an entry matches an element; higher wins, -1 = no match. */
export type ControlTester = (
  element: UiSchemaElement,
  context?: ControlContext,
) => number;

export interface RegistryEntry<R> {
  tester: ControlTester;
  renderer: R;
}

/** A generic, framework-agnostic control registry. */
export class ControlRegistry<R> {
  private entries: RegistryEntry<R>[] = [];

  register(tester: ControlTester, renderer: R): this {
    this.entries.push({ tester, renderer });
    return this;
  }

  registerAll(entries: RegistryEntry<R>[]): this {
    this.entries.push(...entries);
    return this;
  }

  /** Resolve the best-matching renderer, or undefined if none applies. */
  resolve(element: UiSchemaElement, context?: ControlContext): R | undefined {
    let best: R | undefined;
    let bestRank = NOT_APPLICABLE;
    for (const entry of this.entries) {
      const rank = entry.tester(element, context);
      if (rank > bestRank) {
        bestRank = rank;
        best = entry.renderer;
      }
    }
    return bestRank > NOT_APPLICABLE ? best : undefined;
  }

  /** Number of registered entries. */
  get size(): number {
    return this.entries.length;
  }

  clear(): void {
    this.entries = [];
  }
}

// --- Tester factories (shared by both framework renderers) ------------------

/** Read the omf extension bag off an element, if present. */
function omf(element: UiSchemaElement): Record<string, unknown> | undefined {
  const options = (element as { options?: { omf?: Record<string, unknown> } }).options;
  return options?.omf;
}

/** Matches when `options.omf.control` equals `control`. Highest default rank. */
export function byOmfControl(control: string, rank = 20): ControlTester {
  return (element) => (omf(element)?.control === control ? rank : NOT_APPLICABLE);
}

/** Matches a custom `Omf*` layout element by its `type`. */
export function byOmfLayout(type: string, rank = 15): ControlTester {
  return (element) => (element.type === type ? rank : NOT_APPLICABLE);
}

/** Matches a standard JSON Forms element `type` (Control, Group, …). */
export function byType(type: string, rank = 5): ControlTester {
  return (element) => (element.type === type ? rank : NOT_APPLICABLE);
}

/** Matches Control elements whose resolved field schema has a given type. */
export function bySchemaType(schemaType: string, rank = 8): ControlTester {
  return (element, context) => {
    if (element.type !== 'Control') return NOT_APPLICABLE;
    const t = context?.fieldSchema?.type;
    const matches = Array.isArray(t) ? t.includes(schemaType as never) : t === schemaType;
    return matches ? rank : NOT_APPLICABLE;
  };
}
