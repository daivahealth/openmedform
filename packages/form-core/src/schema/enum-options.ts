/**
 * Resolve the choices of a single-select control: code, display label, and
 * (when scored) the points that choice contributes.
 *
 * Both renderers call this so React and Angular cannot label the same schema
 * differently — the parity guarantee is the whole reason it lives here rather
 * than in either renderer.
 *
 * A clinical schema stores stable, language-independent codes (`ALERT`, `NO`)
 * and displays something else. Three ways to say what:
 *
 *   1. `oneOf: [{ const: 'NO', title: 'No' }]` — JSON Forms-native, the label
 *      sits beside the value it names. Preferred.
 *   2. `enum: ['NO']` + `options.omf.optionLabels: { NO: 'No' }` — for schemas
 *      that already carry a plain enum.
 *   3. neither — the code is shown verbatim. Never blank: a visible `NO` is a
 *      fixable authoring mistake, an empty radio is a mystery.
 *
 * Framework-independent: no rendering, no I/O.
 */

export interface EnumOption {
  /** The value stored in the response — the stable code. */
  code: string;
  /** What the user reads. Falls back to `code`. */
  label: string;
  /** Points this choice contributes, when the control is scored. */
  points?: number;
}

/** The slice of a JSON Schema node this resolver reads. */
interface EnumSchemaLike {
  enum?: unknown[];
  oneOf?: Array<{ const?: unknown; title?: string }>;
}

/**
 * The slice of a UI element this resolver reads.
 *
 * Structural on purpose rather than `UiSchemaElement`: the renderers hand over
 * JSON Forms' own `ControlElement`, whose `label` is wider than ours. Both
 * satisfy this, and neither has to be cast at the call site.
 */
interface OmfOptionsCarrier {
  options?: { omf?: unknown } & Record<string, unknown>;
}

function readOmf(el: OmfOptionsCarrier | undefined): Record<string, unknown> | undefined {
  const omf = el?.options?.omf;
  return omf && typeof omf === 'object' ? (omf as Record<string, unknown>) : undefined;
}

function readStringMap(value: unknown): Record<string, string> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, string>)
    : undefined;
}

function readNumberMap(value: unknown): Record<string, number> | undefined {
  return value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, number>)
    : undefined;
}

/** Read `options.omf.optionPoints` off a UI element, if present. */
export function elementOptionPoints(
  el: OmfOptionsCarrier | undefined,
): Record<string, number> | undefined {
  return readNumberMap(readOmf(el)?.optionPoints);
}

/**
 * The options of an enum control, in schema order.
 *
 * Returns `[]` for a schema with neither `enum` nor `oneOf` — the caller is
 * then not looking at a single-select and should render its normal control.
 */
export function resolveEnumOptions(
  schema: EnumSchemaLike | undefined,
  uischema?: OmfOptionsCarrier,
): EnumOption[] {
  const labels = readStringMap(readOmf(uischema)?.optionLabels);
  const points = elementOptionPoints(uischema);

  const decorate = (code: string, title?: string): EnumOption => {
    const option: EnumOption = { code, label: title || labels?.[code] || code };
    if (points && typeof points[code] === 'number') option.points = points[code];
    return option;
  };

  // oneOf wins: a title written next to its const is the most specific
  // statement of intent available.
  const oneOf = schema?.oneOf;
  if (Array.isArray(oneOf) && oneOf.length > 0) {
    return oneOf
      .filter((entry) => entry && (typeof entry.const === 'string' || typeof entry.const === 'number'))
      .map((entry) => decorate(String(entry.const), entry.title));
  }

  const values = schema?.enum;
  if (Array.isArray(values)) {
    return values
      .filter((v) => typeof v === 'string' || typeof v === 'number')
      .map((v) => decorate(String(v)));
  }

  return [];
}
