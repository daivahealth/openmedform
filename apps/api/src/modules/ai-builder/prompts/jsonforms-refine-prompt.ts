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
  touched). Never drop existing fields the user did not ask to remove.`
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
