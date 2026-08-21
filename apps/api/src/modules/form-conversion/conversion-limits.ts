/**
 * Deployment-configurable budgets for one AI form-conversion pass.
 *
 * These bounds exist for correctness, not fairness: one pass has to emit the
 * whole Data + UI + Print schema set inside the model's output-token budget,
 * and past that much form the model starts silently dropping later sections.
 * That makes them a property of the DEPLOYMENT (which providers/models it
 * runs, what those can reliably emit), so they are env vars for the operator —
 * never per-user settings like the form quota, which bounds spend rather than
 * what a single pass can produce.
 *
 * The four values move together. Raising the field limit without raising the
 * token budget trades a clear rejection for a silently truncated form; raising
 * the field limit without raising the source-char budget clips the INPUT
 * instead. Defaults are today's long-standing values, calibrated for a 32k
 * output budget; the operator raises them only when every configured provider
 * can honor the larger request (Kimi/Minimax/Ollama ceilings are lower than
 * OpenAI GPT-5-family or Claude).
 *
 * Read from process.env at call time (the html-render.ts pattern), so tests
 * and container restarts pick changes up without ConfigService plumbing.
 */

interface LimitSpec {
  envVar: string;
  fallback: number;
  /** Floor, so a typo in an env var cannot zero the pipeline. */
  min: number;
}

const MAX_FIELDS: LimitSpec = { envVar: 'CONVERSION_MAX_FIELDS', fallback: 120, min: 10 };
const MAX_TABLE_ROWS: LimitSpec = { envVar: 'CONVERSION_MAX_TABLE_ROWS', fallback: 120, min: 10 };
const MAX_TOKENS: LimitSpec = { envVar: 'CONVERSION_MAX_TOKENS', fallback: 32768, min: 1000 };
const MAX_SOURCE_CHARS: LimitSpec = {
  envVar: 'CONVERSION_MAX_SOURCE_CHARS',
  fallback: 24_000,
  min: 1000,
};

function readLimit(spec: LimitSpec): number {
  const raw = process.env[spec.envVar];
  if (!raw) return spec.fallback;
  const parsed = Number.parseInt(raw, 10);
  if (!Number.isFinite(parsed)) return spec.fallback;
  return Math.max(spec.min, parsed);
}

/** Most form fields one HTML conversion pass accepts. `CONVERSION_MAX_FIELDS`. */
export function conversionMaxFields(): number {
  return readLimit(MAX_FIELDS);
}

/** Most table rows one HTML conversion pass accepts. `CONVERSION_MAX_TABLE_ROWS`. */
export function conversionMaxTableRows(): number {
  return readLimit(MAX_TABLE_ROWS);
}

/** Output-token budget for a conversion/generation call. `CONVERSION_MAX_TOKENS`. */
export function conversionMaxTokens(): number {
  return readLimit(MAX_TOKENS);
}

/**
 * Character budget for the source the model reads: the cleaned HTML of a
 * mock-up, or the extracted text of a PDF. `CONVERSION_MAX_SOURCE_CHARS`.
 */
export function conversionMaxSourceChars(): number {
  return readLimit(MAX_SOURCE_CHARS);
}
