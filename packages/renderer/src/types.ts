export type {
  ScoringRules,
  ScoringResult,
  ScoringRule,
} from '@openmedform/shared';

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

export interface SubmissionResult {
  data: Record<string, unknown>;
  scores: Record<string, number | string>;
  riskLevel?: string;
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
