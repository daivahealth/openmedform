/**
 * JSON Forms engine branch.
 *
 * Renders a jsonforms FormDefinition (separated Data/UI schemas) with the
 * platform renderer set. Validation uses form-core's Ajv 2020-12 instance so
 * the schema dialect matches the backend exactly; the design tokens are applied
 * as scoped CSS custom properties so the output matches the Angular renderer.
 */

import { useMemo, useState, type CSSProperties } from 'react';
import { JsonForms } from '@jsonforms/react';
import { JsonFormsStyleContext, vanillaCells, vanillaStyles } from '@jsonforms/vanilla-renderers';
import type { JsonSchema as JsonFormsSchema, UISchemaElement } from '@jsonforms/core';
import { createAjv } from '@openmedform/form-core';
import { cssVariables } from '@openmedform/form-design-tokens';
import type { HistoryEntry, HistoryProvider, JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { rendererRegistry } from './renderer-registry';
import { HistoryScope } from './history/history-context';

export interface JsonFormsRendererProps {
  definition: JsonFormsFormDefinition;
  data?: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: (data: Record<string, unknown>, errors?: unknown[]) => void;
  /**
   * How validation errors are surfaced. Defaults to 'ValidateAndHide' so
   * required-field errors do NOT appear on an untouched form; validation still
   * runs (errors flow through onChange for submit gating, and the server
   * re-validates). Pass 'ValidateAndShow' to reveal errors (e.g. after a failed
   * submit).
   */
  validationMode?: 'ValidateAndShow' | 'ValidateAndHide' | 'NoValidation';
  /**
   * Prior fills of this form for the same patient, as the host stored them
   * (ADR-005). Fields whose definition carries `omf.history` show a
   * previous-value chip. Each entry may name the definition it was filled
   * against when that differs from `definition`; alignment is by terminology
   * binding first, data path second.
   */
  history?: HistoryEntry[];
  /**
   * Lazy per-field lookup of prior readings — the host closes over the patient
   * identifier, the renderer never sees it. Called once per history-enabled
   * field on mount; results are merged with (and win over) `history`.
   */
  historyProvider?: HistoryProvider;
}

/** Design tokens as a scoped inline style (CSS custom properties). */
const tokenStyle = cssVariables as unknown as CSSProperties;

/**
 * The few rules that inline styles cannot express because they target a
 * descendant. Scoped to `.omf-jsonforms-scope` so a host application's own
 * styles are never affected.
 */
const SCOPED_CSS = `
.omf-jsonforms-scope .omf-table-cell .omf-field { margin-bottom: 0; }
/* A flex/grid item defaults to min-width:auto, so it refuses to shrink below
   its content — which makes a wide table push the HOST page sideways instead
   of scrolling inside its own container. Opt out at the renderer root and at
   the scroll wrappers so wide tables stay contained wherever we are embedded. */
.omf-jsonforms-scope { min-width: 0; max-width: 100%; }
.omf-jsonforms-scope .omf-scroll-x { min-width: 0; max-width: 100%; }
/* A record's detail panel sits inside a table cell; drop the trailing gap so the
   last field does not float above the cell border. */
.omf-jsonforms-scope .omf-record-detail > * > .omf-field:last-child { margin-bottom: 0; }
`;

export function JsonFormsRenderer({
  definition,
  data,
  readOnly,
  onChange,
  validationMode = 'ValidateAndHide',
  history,
  historyProvider,
}: JsonFormsRendererProps) {
  const ajv = useMemo(() => createAjv(), []);
  const [formData, setFormData] = useState<Record<string, unknown>>(data ?? {});

  return (
    <div className="omf-jsonforms-scope" style={tokenStyle}>
      <style>{SCOPED_CSS}</style>
      <JsonFormsStyleContext.Provider value={{ styles: vanillaStyles }}>
        <HistoryScope definition={definition} history={history} historyProvider={historyProvider}>
          <JsonForms
            schema={definition.dataSchema as unknown as JsonFormsSchema}
            uischema={definition.uiSchema.layout as unknown as UISchemaElement}
            data={formData}
            renderers={rendererRegistry}
            cells={vanillaCells}
            ajv={ajv as never}
            validationMode={validationMode}
            readonly={readOnly}
            onChange={({ data: next, errors }) => {
              setFormData(next);
              onChange?.(next, errors ?? []);
            }}
          />
        </HistoryScope>
      </JsonFormsStyleContext.Provider>
    </div>
  );
}
