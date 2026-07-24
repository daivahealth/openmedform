/**
 * React engine dispatcher.
 *
 * One component, both engines: it inspects `FormDefinition.engine` and routes to
 * the Form.io branch (delegating to the preserved @openmedform/renderer) or the
 * JSON Forms branch. Host apps (apps/web, demos) depend only on this seam and
 * stay engine-agnostic — the discriminated `FormDefinition` union keeps the
 * per-engine payloads type-safe.
 */

import type { PatientContext, SubmissionResult } from '@openmedform/renderer';
import type { FormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';
import { FormioBranch } from './engine/formio/FormioRenderer';

export interface FormRendererProps {
  definition: FormDefinition;
  /** Initial/current response data. */
  data?: Record<string, unknown>;
  readOnly?: boolean;
  /** Patient banner context (Form.io branch). */
  patientContext?: PatientContext;
  /** Fires on every edit. The jsonforms branch also passes validation errors. */
  onChange?: (data: Record<string, unknown>, errors?: unknown[]) => void;
  /** Fires on submit (Form.io branch, which owns the submit lifecycle). */
  onSubmit?: (result: SubmissionResult) => void;
}

export function FormRenderer({
  definition,
  data,
  readOnly,
  patientContext,
  onChange,
  onSubmit,
}: FormRendererProps) {
  if (definition.engine === 'jsonforms') {
    return (
      <JsonFormsRenderer
        definition={definition}
        data={data}
        readOnly={readOnly}
        onChange={onChange}
      />
    );
  }

  return (
    <FormioBranch
      definition={definition}
      data={data}
      readOnly={readOnly}
      patientContext={patientContext}
      onChange={onChange}
      onSubmit={onSubmit}
    />
  );
}
