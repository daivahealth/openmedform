/**
 * Test-only stub for @openmedform/renderer.
 *
 * The real package bundles the forked Form.io stack, whose built output is
 * absent on a clean CI checkout. Tests alias `@openmedform/renderer` to this
 * stub (see vitest.config.ts) so the Form.io branch resolves without pulling
 * Form.io in; FormRenderer.test.tsx still overrides it with its own vi.mock.
 */

export interface PatientContext {
  [key: string]: unknown;
}

export interface SubmissionResult {
  data: Record<string, unknown>;
  scores: Record<string, number | string>;
  riskLevel?: string;
}

export function FormRenderer(props: { schema?: unknown }) {
  return <div data-testid="formio-branch">formio:{JSON.stringify(props.schema)}</div>;
}
