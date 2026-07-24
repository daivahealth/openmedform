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
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { rendererRegistry } from './renderer-registry';

export interface JsonFormsRendererProps {
  definition: JsonFormsFormDefinition;
  data?: Record<string, unknown>;
  readOnly?: boolean;
  onChange?: (data: Record<string, unknown>, errors?: unknown[]) => void;
}

/** Design tokens as a scoped inline style (CSS custom properties). */
const tokenStyle = cssVariables as unknown as CSSProperties;

export function JsonFormsRenderer({ definition, data, readOnly, onChange }: JsonFormsRendererProps) {
  const ajv = useMemo(() => createAjv(), []);
  const [formData, setFormData] = useState<Record<string, unknown>>(data ?? {});

  return (
    <div className="omf-jsonforms-scope" style={tokenStyle}>
      <JsonFormsStyleContext.Provider value={{ styles: vanillaStyles }}>
        <JsonForms
          schema={definition.dataSchema as unknown as JsonFormsSchema}
          uischema={definition.uiSchema.layout as unknown as UISchemaElement}
          data={formData}
          renderers={rendererRegistry}
          cells={vanillaCells}
          ajv={ajv as never}
          readonly={readOnly}
          onChange={({ data: next, errors }) => {
            setFormData(next);
            onChange?.(next, errors ?? []);
          }}
        />
      </JsonFormsStyleContext.Provider>
    </div>
  );
}
