/**
 * Form.io engine branch.
 *
 * The existing Form.io renderer (@openmedform/renderer) is preserved unchanged;
 * this branch simply adapts a formio FormDefinition to its established
 * `FormRendererProps` seam. No Form.io behaviour is reimplemented here.
 */

import { FormRenderer as FormioFormRenderer, type PatientContext, type SubmissionResult } from '@openmedform/renderer';
import type { FormioFormDefinition } from '@openmedform/form-schema-types';

export interface FormioBranchProps {
  definition: FormioFormDefinition;
  data?: Record<string, unknown>;
  readOnly?: boolean;
  patientContext?: PatientContext;
  onChange?: (data: Record<string, unknown>) => void;
  onSubmit?: (result: SubmissionResult) => void;
}

export function FormioBranch({ definition, data, readOnly, patientContext, onChange, onSubmit }: FormioBranchProps) {
  return (
    <FormioFormRenderer
      schema={definition.schema}
      submission={data}
      patientContext={patientContext}
      readOnly={readOnly}
      onChange={onChange}
      onSubmit={onSubmit}
    />
  );
}
