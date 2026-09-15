/**
 * Response → Observation projection for the API (ADR-005).
 *
 * Mirrors @openmedform/form-core's `projectObservations` and `historyKeyForPath`,
 * reimplemented here because the NestJS (CommonJS) backend cannot cleanly
 * consume that ESM package — the same reason the scoring and validation
 * services are self-contained. `observation-projection.test.ts` runs BOTH
 * implementations over the same fixtures and fails if they ever disagree, so
 * the "one walker" rule holds in behaviour even though the code is duplicated.
 * Change form-core first, then port here; never the reverse.
 *
 * Pure functions over plain objects. No Prisma, no Nest.
 */

// --- contracts (structural copies of @openmedform/form-schema-types) ---------

export interface OmfCoding {
  system: string;
  code: string;
  display?: string;
  source: 'ai' | 'human';
  confidence?: number;
  verified: boolean;
}

export type ObservationValue = number | string | boolean;

export interface Observation {
  path: string;
  coding?: OmfCoding[];
  valueCoding?: OmfCoding[];
  label: string;
  section?: string;
  value: ObservationValue;
  valueLabel?: string;
  unit?: string;
  effectiveAt: string;
  source?: Record<string, unknown>;
}

export interface ProjectContext {
  effectiveAt: string;
  source?: Record<string, unknown>;
}

interface SchemaNode {
  $ref?: string;
  type?: string | string[];
  title?: string;
  properties?: Record<string, SchemaNode>;
  items?: SchemaNode | SchemaNode[];
  enum?: unknown[];
  oneOf?: Array<{ const?: unknown; title?: string }>;
  [key: string]: unknown;
}

interface UiElement {
  type?: string;
  scope?: string;
  label?: unknown;
  elements?: UiElement[];
  options?: { detail?: unknown; omf?: Record<string, unknown>; [key: string]: unknown };
}

export interface DefinitionSchemas {
  dataSchema?: unknown;
  uiSchema?: unknown;
}

// --- pointer / path helpers (form-core schema/pointer.ts) --------------------

function decodeSegment(segment: string): string {
  return segment.replace(/~1/g, '/').replace(/~0/g, '~');
}

function scopeToSchemaSegments(scope: string): string[] {
  return scope
    .replace(/^#/, '')
    .split('/')
    .filter((s) => s.length > 0)
    .map(decodeSegment);
}

/** `#/properties/a/properties/b` → `a.b` (JSON Forms convention: drop keyword segments). */
export function scopeToDataPath(scope: string): string {
  const segments = scopeToSchemaSegments(scope);
  const out: string[] = [];
  for (let i = 1; i < segments.length; i += 2) out.push(segments[i]);
  return out.join('.');
}

function walkSegments(root: SchemaNode, segments: string[]): SchemaNode | undefined {
  let current: unknown = root;
  for (const segment of segments) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current as SchemaNode | undefined;
}

function deref(schema: SchemaNode | undefined, root: SchemaNode): SchemaNode | undefined {
  if (schema && typeof schema.$ref === 'string' && schema.$ref.startsWith('#')) {
    return walkSegments(root, scopeToSchemaSegments(schema.$ref));
  }
  return schema;
}

function resolveSchemaAtScope(root: SchemaNode, scope: string): SchemaNode | undefined {
  const segments = scopeToSchemaSegments(scope);
  let current: SchemaNode | undefined = root;
  for (const segment of segments) {
    current = deref(current, root);
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment] as SchemaNode | undefined;
  }
  return deref(current, root);
}

function getValueAtPath(data: unknown, path: string): unknown {
  let current: unknown = data;
  for (const segment of path.split('.').filter((s) => s.length > 0)) {
    if (current == null || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[segment];
  }
  return current;
}

/** Numeric segments removed: `treatments.2.dose` → `treatments.dose` (form-core `historyKeyForPath`). */
export function historyKeyForPath(path: string): string {
  return path
    .split('.')
    .filter((segment) => segment.length > 0 && !/^\d+$/.test(segment))
    .join('.');
}

// --- enum options (form-core schema/enum-options.ts) ------------------------

interface EnumOption {
  code: string;
  label: string;
}

function readOmf(el: UiElement | undefined): Record<string, unknown> {
  return (el?.options?.omf ?? {}) as Record<string, unknown>;
}

function stringMap(value: unknown): Record<string, string> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : undefined;
}

function resolveEnumOptions(schema: SchemaNode | undefined, el: UiElement | undefined): EnumOption[] {
  const labels = stringMap(readOmf(el).optionLabels);
  const decorate = (code: string, title?: string): EnumOption => ({
    code,
    label: title || labels?.[code] || code,
  });
  const oneOf = schema?.oneOf;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return oneOf
      .filter((e) => e && (typeof e.const === 'string' || typeof e.const === 'number'))
      .map((e) => decorate(String(e.const), e.title));
  }
  const values = schema?.enum;
  if (Array.isArray(values)) {
    return values.filter((v) => typeof v === 'string' || typeof v === 'number').map((v) => decorate(String(v)));
  }
  return [];
}

function resolveMultiEnumOptions(schema: SchemaNode | undefined, el: UiElement | undefined): EnumOption[] {
  const items = schema?.items;
  if (!items || Array.isArray(items)) return [];
  return resolveEnumOptions(items, el);
}

// --- projection (form-core observation/project.ts) --------------------------

function codingList(value: unknown): OmfCoding[] | undefined {
  return Array.isArray(value) && value.length > 0 ? (value as OmfCoding[]) : undefined;
}

function isScalar(value: unknown): value is ObservationValue {
  return typeof value === 'number' || typeof value === 'string' || typeof value === 'boolean';
}

function isEmpty(value: unknown): boolean {
  return value === undefined || value === null || value === '';
}

function resolveLabel(el: UiElement, schema: SchemaNode | undefined, path: string): string {
  return (
    (typeof el.label === 'string' && el.label) || schema?.title || path.split('.').pop() || path
  );
}

function recordDetailLayout(el: UiElement): UiElement | undefined {
  const native = el.options?.detail;
  if (native && typeof native === 'object' && 'type' in (native as object)) return native as UiElement;
  const omf = readOmf(el).detail;
  if (omf && typeof omf === 'object' && 'type' in (omf as object)) return omf as UiElement;
  return undefined;
}

function generatedDetailLayout(items: SchemaNode | undefined): UiElement {
  return {
    type: 'VerticalLayout',
    elements: Object.keys(items?.properties ?? {}).map((key) => ({
      type: 'Control',
      scope: `#/properties/${key}`,
    })),
  };
}

function isoOrUndefined(value: unknown): string | undefined {
  if (typeof value !== 'string' || value.length === 0) return undefined;
  return Number.isNaN(Date.parse(value)) ? undefined : value;
}

function uiRoot(uiSchema: unknown): UiElement {
  const u = uiSchema as { layout?: UiElement } | UiElement | undefined;
  return (((u as { layout?: UiElement })?.layout ?? u) ?? {}) as UiElement;
}

interface Frame {
  schemaRoot: SchemaNode;
  data: unknown;
  pathPrefix: string;
  effectiveAt: string;
}

/** Flatten `data` (filled against `definition`) into observations — see form-core. */
export function projectObservations(
  definition: DefinitionSchemas,
  data: Record<string, unknown> | undefined | null,
  ctx: ProjectContext,
): Observation[] {
  const rows: Observation[] = [];
  const root = uiRoot(definition.uiSchema);
  const rootFrame: Frame = {
    schemaRoot: (definition.dataSchema ?? {}) as SchemaNode,
    data: data ?? {},
    pathPrefix: '',
    effectiveAt: ctx.effectiveAt,
  };

  const emit = (row: Omit<Observation, 'source'>): void => {
    rows.push(ctx.source ? { ...row, source: ctx.source } : row);
  };

  const walk = (el: UiElement, frame: Frame, section: string | undefined): void => {
    const nextSection = el.type === 'Group' && typeof el.label === 'string' ? el.label : section;
    if (el.type === 'Control' && typeof el.scope === 'string') visitControl(el, frame, nextSection);
    for (const child of el.elements ?? []) walk(child, frame, nextSection);
  };

  const visitControl = (el: UiElement, frame: Frame, section: string | undefined): void => {
    const scope = el.scope as string;
    const localPath = scopeToDataPath(scope);
    const path = frame.pathPrefix ? `${frame.pathPrefix}.${localPath}` : localPath;
    const schema = resolveSchemaAtScope(frame.schemaRoot, scope);
    const value = getValueAtPath(frame.data, localPath);
    if (isEmpty(value)) return;

    const omf = readOmf(el);
    const label = resolveLabel(el, schema, localPath);
    const coding = codingList(omf.coding);
    const unit = typeof omf.unit === 'string' ? omf.unit : undefined;
    const optionCoding = (omf.optionCoding ?? {}) as Record<string, unknown>;
    const base = { label, ...(section ? { section } : {}), ...(coding ? { coding } : {}) };

    if (Array.isArray(value) && value.some((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      const items = Array.isArray(schema?.items) ? undefined : schema?.items;
      const detail = recordDetailLayout(el) ?? generatedDetailLayout(items);
      const recordTable = (omf.recordTable ?? {}) as { effectiveAtPath?: string };
      value.forEach((record, index) => {
        if (!record || typeof record !== 'object') return;
        const own = recordTable.effectiveAtPath
          ? isoOrUndefined(getValueAtPath(record, recordTable.effectiveAtPath))
          : undefined;
        walk(
          detail,
          {
            schemaRoot: (items ?? {}) as SchemaNode,
            data: record,
            pathPrefix: `${path}.${index}`,
            effectiveAt: own ?? frame.effectiveAt,
          },
          section,
        );
      });
      return;
    }

    if (Array.isArray(value)) {
      const options = resolveMultiEnumOptions(schema, el);
      for (const item of value) {
        if (!isScalar(item) || isEmpty(item)) continue;
        const code = String(item);
        const option = options.find((o) => o.code === code);
        const valueCoding = codingList(optionCoding[code]);
        emit({
          ...base,
          path,
          value: item,
          ...(option ? { valueLabel: option.label } : {}),
          ...(valueCoding ? { valueCoding } : {}),
          effectiveAt: frame.effectiveAt,
        });
      }
      return;
    }

    if (!isScalar(value)) return;

    const options = resolveEnumOptions(schema, el);
    if (options.length > 0) {
      const code = String(value);
      const option = options.find((o) => o.code === code);
      const valueCoding = codingList(optionCoding[code]);
      emit({
        ...base,
        path,
        value,
        ...(option ? { valueLabel: option.label } : {}),
        ...(valueCoding ? { valueCoding } : {}),
        effectiveAt: frame.effectiveAt,
      });
      return;
    }

    emit({ ...base, path, value, ...(unit ? { unit } : {}), effectiveAt: frame.effectiveAt });
  };

  walk(root, rootFrame, undefined);
  return rows;
}

/**
 * The response's clinical time from a Control flagged `omf.effectiveAt: true`
 * (the first one, depth-first), when its value parses as a date. Undefined
 * when the definition names no such field or it is unanswered.
 */
export function resolveDefinitionEffectiveAt(
  definition: DefinitionSchemas,
  data: Record<string, unknown> | undefined | null,
): string | undefined {
  let found: string | undefined;
  const walk = (el: UiElement): void => {
    if (found) return;
    if (el.type === 'Control' && typeof el.scope === 'string' && readOmf(el).effectiveAt === true) {
      found = isoOrUndefined(getValueAtPath(data ?? {}, scopeToDataPath(el.scope)));
      if (found) return;
    }
    for (const child of el.elements ?? []) walk(child);
  };
  walk(uiRoot(definition.uiSchema));
  return found;
}
