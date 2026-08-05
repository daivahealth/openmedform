/**
 * The dictionary's data source: every bindable item in a form definition,
 * with whatever terminology bindings it already carries.
 *
 * Walks the UI schema (the same walk scoring uses) rather than the data
 * schema, because bindings live on UI elements (`options.omf.coding` /
 * `options.omf.optionCoding`) and because the UI schema is what defines which
 * fields actually exist on the form. Labels resolve the way the renderer
 * resolves them — dataSchema `title` first — so the dictionary names fields
 * the way the clinician sees them.
 *
 * Framework-independent: the web dictionary panel consumes it now; an EMR
 * embedding or the P4 export can consume it identically later.
 */

import type { OmfCoding, UiSchema, UiSchemaElement } from '@openmedform/form-schema-types';
import { scopeToDataPath } from '../schema/pointer';
import { resolveEnumOptions, type EnumOption } from '../schema/enum-options';

export interface CodedOptionRow {
  /** The stored enum code this option row binds. */
  code: string;
  /** What the clinician reads for the option. */
  label: string;
  coding: OmfCoding[];
}

export interface CodedItemRow {
  /** JSON Forms scope — the stable identity used to write bindings back. */
  scope: string;
  /** Dotted data path, e.g. 'assessment.spo2'. */
  path: string;
  /** The field's display label (dataSchema title, falling back to the key). */
  label: string;
  /** Nearest ancestor Group label, for grouping the dictionary visually. */
  section?: string;
  coding: OmfCoding[];
  /** Present only for enum controls: one row per answer option. */
  options?: CodedOptionRow[];
}

interface SchemaNode {
  type?: string | string[];
  title?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode;
  enum?: unknown[];
  oneOf?: Array<{ const?: unknown; title?: string }>;
}

/** Resolve a JSON Forms scope against the data schema, `properties` step by step. */
function schemaAtScope(root: SchemaNode | undefined, scope: string): SchemaNode | undefined {
  if (!root || !scope.startsWith('#/')) return undefined;
  let current: SchemaNode | undefined = root;
  const segments = scope.slice(2).split('/');
  for (const segment of segments) {
    if (!current) return undefined;
    if (segment === 'properties') continue;
    if (segment === 'items') {
      current = current.items;
      continue;
    }
    current = current.properties?.[decodeURIComponent(segment.replace(/~1/g, '/').replace(/~0/g, '~'))];
  }
  return current;
}

function readOmf(el: UiSchemaElement): Record<string, unknown> {
  return ((el as { options?: { omf?: Record<string, unknown> } }).options?.omf ?? {}) as Record<
    string,
    unknown
  >;
}

function codingList(value: unknown): OmfCoding[] {
  return Array.isArray(value) ? (value as OmfCoding[]) : [];
}

/**
 * Every Control in the definition as a dictionary row.
 *
 * All fields are listed — not just already-coded ones — because the
 * dictionary's job is showing what IS and IS NOT mapped; an empty coding list
 * is the to-do state, not noise to filter out.
 */
export function collectCodedItems(
  uiSchema: UiSchema | UiSchemaElement,
  dataSchema?: unknown,
): CodedItemRow[] {
  const root = ((uiSchema as UiSchema).layout ?? uiSchema) as UiSchemaElement;
  const schemaRoot = dataSchema as SchemaNode | undefined;
  const rows: CodedItemRow[] = [];

  const walk = (el: UiSchemaElement, section: string | undefined): void => {
    const nextSection =
      el.type === 'Group' && typeof el.label === 'string' ? el.label : section;

    const scope = (el as { scope?: string }).scope;
    if (typeof scope === 'string' && el.type === 'Control') {
      const omf = readOmf(el);
      const fieldSchema = schemaAtScope(schemaRoot, scope);
      const path = scopeToDataPath(scope);
      const elementLabel = (el as { label?: unknown }).label;
      const label =
        (typeof elementLabel === 'string' && elementLabel) ||
        fieldSchema?.title ||
        path.split('.').pop() ||
        path;

      const enumOptions: EnumOption[] = resolveEnumOptions(fieldSchema, el as never);
      const optionCoding = (omf.optionCoding ?? {}) as Record<string, unknown>;

      rows.push({
        scope,
        path,
        label,
        section: nextSection,
        coding: codingList(omf.coding),
        ...(enumOptions.length > 0
          ? {
              options: enumOptions.map((option) => ({
                code: option.code,
                label: option.label,
                coding: codingList(optionCoding[option.code]),
              })),
            }
          : {}),
      });
    }

    for (const child of ((el as { elements?: UiSchemaElement[] }).elements ?? [])) {
      walk(child, nextSection);
    }
  };

  walk(root, undefined);
  return rows;
}
