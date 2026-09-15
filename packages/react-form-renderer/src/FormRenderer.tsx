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

import type { FormDefinition, HistoryEntry, HistoryProvider } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './engine/jsonforms/JsonFormsRenderer';

export interface FormRendererProps {
  definition: FormDefinition;
  /** Initial/current response data. */
  data?: Record<string, unknown>;
  readOnly?: boolean;
  /** Fires on every edit, with any current validation errors. */
  onChange?: (data: Record<string, unknown>, errors?: unknown[]) => void;
  /** Prior fills for the same patient; see JsonFormsRendererProps.history (ADR-005). */
  history?: HistoryEntry[];
  /** Lazy per-field history lookup; see JsonFormsRendererProps.historyProvider. */
  historyProvider?: HistoryProvider;
}

export function FormRenderer({ definition, data, readOnly, onChange, history, historyProvider }: FormRendererProps) {
  return (
    <JsonFormsRenderer
      definition={definition}
      data={data}
      readOnly={readOnly}
      onChange={onChange}
      history={history}
      historyProvider={historyProvider}
    />
  );
}
