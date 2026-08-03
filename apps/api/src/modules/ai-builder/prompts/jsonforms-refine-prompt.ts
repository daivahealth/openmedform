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
- Apply ONLY the change the user requests. Preserve every other field, scope,
  option, translation, and layout exactly as-is.
- Return the COMPLETE updated object with all four artifacts + conversionMetadata
  (carry the metadata forward; you may lower/raise confidence for fields you
  touched). Never drop existing fields the user did not ask to remove.
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
export function buildJsonFormsRefineUserPrompt(
  current: {
    dataSchema: unknown;
    uiSchema: unknown;
    printSchema: unknown;
    translations: unknown;
    conversionMetadata?: unknown;
  },
  instruction: string,
): string {
  return (
    'Current jsonforms definition:\n' +
    JSON.stringify(
      {
        dataSchema: current.dataSchema,
        uiSchema: current.uiSchema,
        printSchema: current.printSchema,
        translations: current.translations,
        conversionMetadata: current.conversionMetadata ?? { fields: [], warnings: [] },
      },
      null,
      2,
    ) +
    `\n\nUser instruction:\n${instruction}\n\n` +
    'Return the complete updated JSON object (dataSchema, uiSchema, printSchema, translations, conversionMetadata).'
  );
}
