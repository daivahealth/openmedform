/**
 * Hand-written public type surface for @openmedform/renderer.
 *
 * This package's runtime build (tsup) bundles the forked Form.io stack, whose
 * sources are not type-resolvable on a clean checkout (formio-core's built `lib`
 * is gitignored). Consumers in this monorepo — notably @openmedform/react-form-
 * renderer's Form.io branch — only need the public types below, so the package's
 * `types` entry points here. This keeps the JSON Forms renderer buildable in CI
 * without pulling the Form.io type graph in. Runtime resolution still uses the
 * built `dist`.
 */

import type { ComponentType } from 'react';

export interface PatientContext {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  encounterType?: string;
  department?: string;
  consultantName?: string;
  admissionDate?: string;
}

export interface SubmissionResult {
  data: Record<string, unknown>;
  scores: Record<string, number | string>;
  riskLevel?: string;
}

export interface FormTemplate {
  openmedform: string;
  exportedAt: string;
  form: {
    name: string;
    description?: string;
    category?: string;
    formType: 'PATIENT' | 'NON_PATIENT';
    tags?: string[];
  };
  schema: Record<string, unknown>;
  scoringRules: Record<string, unknown>;
  patientContextFields: string[];
}

export interface FormRendererProps {
  schema: Record<string, unknown>;
  scoringRules?: Record<string, unknown>;
  patientContext?: PatientContext;
  submission?: Record<string, unknown>;
  onChange?: (data: Record<string, unknown>) => void;
  onSubmit?: (result: SubmissionResult) => void;
  readOnly?: boolean;
}

export const FormRenderer: ComponentType<FormRendererProps>;
