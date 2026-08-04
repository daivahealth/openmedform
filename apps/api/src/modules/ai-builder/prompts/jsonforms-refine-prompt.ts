import { getPdfToJsonFormsPrompt } from './pdf-to-jsonforms-prompt';

/**
 * System prompt for the prompt-based designer: refine existing jsonforms-engine
 * artifacts via natural language. Reuses the conversion prompt's rules (same
 * output contract, same omf vocabulary, same separation of concerns) and adds
 * refinement discipline — change only what was asked.
 */
export function getJsonFormsRefineSystemPrompt(): string {
  return (
    getPdfToJsonFormsPrompt() +
    `

REFINEMENT MODE
- You are editing an EXISTING jsonforms definition, not creating one from scratch.
- RESPONSE MODES (critical — pick ONE):
  - PATCH mode, the DEFAULT for targeted changes (rename a field, change a widget, set an omf option, add/remove one element). Respond with:
      { "mode": "patch", "changeSummary": "...", "operations": [ <RFC 6902 JSON Patch operations> ] }
    Operation paths are JSON Pointers into the EXACT "Current jsonforms definition" object you were shown, e.g.
      { "op": "replace", "path": "/dataSchema/properties/idBandOn/title", "value": "ID Band Verified" }
      { "op": "add", "path": "/uiSchema/layout/elements/2/options/omf/hideSectionTotal", "value": true }
    Allowed ops: add, replace, remove, move, copy. Array segments are zero-based; use "-" to append. Remember "~" escapes: "/" in a key is "~1", "~" is "~0". Emit the FEWEST operations that fully express the change — a rename is one replace, not a rewrite. If an intermediate object you need (e.g. "options" or "omf") does not exist yet, add the whole object in one op.
  - FULL mode, ONLY when the request genuinely rewrites large parts of the definition (restructuring into tabs, reordering many sections, regenerating a whole group): return the complete updated object with all four artifacts + conversionMetadata + changeSummary, exactly as before. No "mode" field is needed.
  - Never mix modes, never return a patch that you are not certain applies to the shown document. If unsure, use FULL mode.
- Apply ONLY the change the user requests. Preserve every other field, scope,
  option, translation, and layout exactly as-is.
- Include a top-level "changeSummary" string alongside the artifacts: 1-4
  plain sentences addressed to the user describing exactly what you changed,
  past tense, naming the fields/sections touched (e.g. "Renamed 'ID Band On'
  to 'ID Band Verified'. Everything else is unchanged."). If part of the
  request could not be applied, say which part and why. Describe only edits
  you actually made — never claim more. No greetings, no marketing tone.
- In FULL mode, return the COMPLETE updated object with all four artifacts +
  conversionMetadata (carry the metadata forward; you may lower/raise
  confidence for fields you touched). Never drop existing fields the user did
  not ask to remove — in either mode.
- Before returning, repair any enum whose CODES have points baked into them
  ("YES_25", "FURNITURE_30", "WEAK_10") — a generation before omf.optionPoints
  existed. Rewrite each code to name only the answer ("YES", "FURNITURE",
  "WEAK"), move the number into omf.optionPoints on that Control keyed by the
  new code, and give each option its source-text title via "oneOf". Update any
  "rule" condition "const" that referenced an old code. This is a repair, not a
  redesign: same fields, same order, same labels.
- Before returning, repair every invalid nested JSON Forms Control scope so all
  existing checkbox controls render. Preserve every field, Greek label,
  validation rule, and layout. Nested object controls MUST include
  "/properties/" at every object level — for example,
  "#/properties/reasonForCall/properties/pulseLessThan40". Do not add, remove,
  rename, or translate fields while repairing scopes.`
  );
}

/** Build the user prompt carrying the current artifacts + the instruction. */
export interface RefineArtifacts {
  dataSchema: unknown;
  uiSchema: unknown;
  printSchema: unknown;
  translations: unknown;
  conversionMetadata?: unknown;
}

/**
 * The single document a refinement operates on. Built here — and ONLY here —
 * because two things must agree on it byte for byte: the prompt shows it to
 * the model, and the patch path (#130) applies the model's JSON-Pointer
 * operations to it. A pointer like `/uiSchema/layout/elements/0` only means
 * what the model thinks it means if both sides built the same object.
 */
export function buildRefineDocument(current: RefineArtifacts): Record<string, unknown> {
  return {
    dataSchema: current.dataSchema,
    uiSchema: current.uiSchema,
    printSchema: current.printSchema,
    translations: current.translations,
    conversionMetadata: current.conversionMetadata ?? { fields: [], warnings: [] },
  };
}

export function buildJsonFormsRefineUserPrompt(
  current: RefineArtifacts,
  instruction: string,
): string {
  return (
    'Current jsonforms definition:\n' +
    JSON.stringify(buildRefineDocument(current), null, 2) +
    `\n\nUser instruction:\n${instruction}\n\n` +
    'Respond in PATCH mode for a targeted change, or FULL mode for a rewrite (see RESPONSE MODES).'
  );
}
