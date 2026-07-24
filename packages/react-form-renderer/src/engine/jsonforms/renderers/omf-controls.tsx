/**
 * omf-aware standard controls — textarea and radio — selected via
 * `options.omf.control`. These demonstrate the extension mechanism: stock
 * JSON Forms would render a string as a single-line input and an enum as a
 * select; the omf bag lets a form author opt into a multiline area or an inline
 * radio group without leaving the JSON Forms vocabulary.
 */

import type { ComponentType } from 'react';
import type { ControlProps } from '@jsonforms/core';
import { rankWith } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { FieldFrame, inputStyle } from './field-frame';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

// --- textarea ---------------------------------------------------------------

function OmfTextarea(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, uischema } = props;
  if (!visible) return null;
  const rows = (readOmf(uischema)?.screen as { rows?: number } | undefined)?.rows ?? 3;
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <textarea
        id={id}
        value={(data as string) ?? ''}
        rows={rows}
        disabled={!enabled}
        style={{ ...inputStyle, resize: 'vertical' }}
        onChange={(e) => handleChange(path, e.target.value || undefined)}
      />
    </FieldFrame>
  );
}

export const omfTextareaTester = rankWith(OMF_CONTROL_RANK, omfControlIs('textarea'));
export const OmfTextareaControl: ComponentType<any> = withJsonFormsControlProps(OmfTextarea);

// --- radio ------------------------------------------------------------------

function OmfRadio(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema, uischema } = props;
  if (!visible) return null;
  const options = (schema.enum ?? []) as string[];
  const inline = (readOmf(uischema)?.screen as { inline?: boolean } | undefined)?.inline ?? false;
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <div style={{ display: 'flex', flexDirection: inline ? 'row' : 'column', gap: inline ? 16 : 4, flexWrap: 'wrap' }}>
        {options.map((option) => (
          <label key={option} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 'var(--omf-font-size-body, 14px)' }}>
            <input
              type="radio"
              name={id}
              value={option}
              checked={data === option}
              disabled={!enabled}
              onChange={() => handleChange(path, option)}
            />
            {option}
          </label>
        ))}
      </div>
    </FieldFrame>
  );
}

export const omfRadioTester = rankWith(OMF_CONTROL_RANK, omfControlIs('radio'));
export const OmfRadioControl: ComponentType<any> = withJsonFormsControlProps(OmfRadio);
