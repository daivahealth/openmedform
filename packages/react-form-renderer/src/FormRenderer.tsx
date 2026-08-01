/**
 * The React renderer entry point.
 *
 * BREAKING (v1.0.0): this used to be a dispatcher that inspected
 * `FormDefinition.engine` and routed to either a Form.io branch or the JSON
 * Forms branch. The Form.io engine was removed (ADR-004), so this is now a thin
 * wrapper over `JsonFormsRenderer`, kept as the stable public seam host apps
 * already import. The `patientContext` and `onSubmit` props went with the
 * Form.io branch, which owned the patient banner and the submit lifecycle — a
 * host now renders its own submit control and calls its own handler.
 */

import type { FormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';

export interface FormRendererProps {
  definition: FormDefinition;
  /** Initial/current response data. */
  data?: Record<string, unknown>;
  readOnly?: boolean;
  /** Fires on every edit, with any current validation errors. */
  onChange?: (data: Record<string, unknown>, errors?: unknown[]) => void;
}

export function FormRenderer({ definition, data, readOnly, onChange }: FormRendererProps) {
  return (
    <JsonFormsRenderer
      definition={definition}
      data={data}
      readOnly={readOnly}
      onChange={onChange}
    />
  );
}
