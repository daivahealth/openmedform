/**
 * omf-aware standard controls — textarea and radio — selected via
 * `options.omf.control`. These demonstrate the extension mechanism: stock
 * JSON Forms would render a string as a single-line input and an enum as a
 * select; the omf bag lets a form author opt into a multiline area or an inline
 * radio group without leaving the JSON Forms vocabulary.
 */

import type { ComponentType } from 'react';
import type { ControlProps, LayoutProps, GroupLayout, Layout, UISchemaElement } from '@jsonforms/core';
import {
  rankWith,
  isBooleanControl,
  uiTypeIs,
  and,
  or,
  not,
  isStringControl,
  isNumberControl,
  isIntegerControl,
  isDateControl,
  isEnumControl,
} from '@jsonforms/core';
import {
  withJsonFormsControlProps,
  withJsonFormsLayoutProps,
  JsonFormsDispatch,
} from '@jsonforms/react';
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

// --- default single-line input (bordered box — text/number/date/time) -------
// Ranked above the vanilla input (which renders a borderless faint line) but
// below the omf.control-specific renderers (textarea/radio, rank 20).

const OMF_INPUT_RANK = 5;

function inputType(schema: { type?: string | string[]; format?: string }): string {
  switch (schema.format) {
    case 'date':
      return 'date';
    case 'time':
      return 'time';
    case 'date-time':
      return 'datetime-local';
    case 'email':
      return 'email';
    default: {
      const t = Array.isArray(schema.type) ? schema.type[0] : schema.type;
      return t === 'number' || t === 'integer' ? 'number' : 'text';
    }
  }
}

function OmfInput(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema } = props;
  if (!visible) return null;
  const type = inputType(schema);
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <input
        id={id}
        type={type}
        value={(data as string | number | undefined) ?? ''}
        disabled={!enabled}
        style={inputStyle}
        onChange={(e) => {
          const raw = e.target.value;
          if (type === 'number') handleChange(path, raw === '' ? undefined : Number(raw));
          else handleChange(path, raw || undefined);
        }}
      />
    </FieldFrame>
  );
}

export const omfInputTester = rankWith(
  OMF_INPUT_RANK,
  and(or(isStringControl, isNumberControl, isIntegerControl, isDateControl), not(isEnumControl)),
);
export const OmfInputControl: ComponentType<any> = withJsonFormsControlProps(OmfInput);

// --- default enum select (bordered box) -------------------------------------

function OmfSelect(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange, schema } = props;
  if (!visible) return null;
  const options = (schema.enum ?? []) as string[];
  return (
    <FieldFrame id={id} label={label} required={required} errors={errors}>
      <select
        id={id}
        value={(data as string) ?? ''}
        disabled={!enabled}
        style={inputStyle}
        onChange={(e) => handleChange(path, e.target.value || undefined)}
      >
        <option value="">—</option>
        {options.map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </FieldFrame>
  );
}

export const omfSelectTester = rankWith(OMF_INPUT_RANK, isEnumControl);
export const OmfSelectControl: ComponentType<any> = withJsonFormsControlProps(OmfSelect);

// --- checkbox (box on the LEFT, then label — matches paper forms) -----------

function OmfCheckbox(props: ControlProps) {
  const { id, label, data, enabled, visible, required, errors, path, handleChange } = props;
  if (!visible) return null;
  return (
    <div className="omf-field" style={{ marginBottom: 'var(--omf-field-gap, 12px)' }}>
      <label style={{ display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 'var(--omf-font-size-body, 14px)' }}>
        <input
          id={id}
          type="checkbox"
          checked={data === true}
          disabled={!enabled}
          onChange={(e) => handleChange(path, e.target.checked)}
        />
        <span>
          {label}
          {required ? <span style={{ color: 'var(--omf-color-invalid, #c0392b)' }}> *</span> : null}
        </span>
      </label>
      {errors ? (
        <div style={{ fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-invalid, #c0392b)' }}>
          {errors}
        </div>
      ) : null}
    </div>
  );
}

// Wins over the vanilla boolean renderer for every boolean control.
export const omfCheckboxTester = rankWith(OMF_CONTROL_RANK, isBooleanControl);
export const OmfCheckboxControl: ComponentType<any> = withJsonFormsControlProps(OmfCheckbox);

// --- group (bordered box + shaded header band — matches paper sections) -----

function OmfGroup(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  if (!visible) return null;
  const group = uischema as GroupLayout;
  const elements = group.elements ?? [];
  return (
    <div
      style={{
        border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
        borderRadius: 'var(--omf-border-radius, 4px)',
        marginBottom: 'var(--omf-section-gap, 16px)',
        overflow: 'hidden',
      }}
    >
      {group.label ? (
        <div
          style={{
            background: 'var(--omf-color-section-bg, #f7f8fa)',
            borderBottom: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
            padding: 'var(--omf-control-padding, 8px)',
            fontWeight: 'var(--omf-label-weight, 600)' as never,
            fontSize: 'var(--omf-font-size-label, 13px)',
            color: 'var(--omf-color-label, #3a4552)',
          }}
        >
          {group.label}
        </div>
      ) : null}
      <div style={{ padding: 'var(--omf-control-padding, 8px)' }}>
        {elements.map((child, index) => (
          <JsonFormsDispatch
            key={index}
            uischema={child}
            schema={schema}
            path={path}
            enabled={enabled}
            renderers={renderers}
            cells={cells}
          />
        ))}
      </div>
    </div>
  );
}

export const omfGroupTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('Group'));
export const OmfGroupControl: ComponentType<any> = withJsonFormsLayoutProps(OmfGroup);

// --- horizontal layout (colSpan-aware row with gaps — no overlap) -----------

function childColSpan(child: UISchemaElement): number | undefined {
  return (child as { options?: { omf?: { screen?: { colSpan?: number } } } })?.options?.omf?.screen
    ?.colSpan;
}

function OmfHorizontalLayout(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  if (!visible) return null;
  const elements = (uischema as Layout).elements ?? [];
  const gap = 'var(--omf-control-gap, 12px)';
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap, alignItems: 'flex-start' }}>
      {elements.map((child, index) => {
        const colSpan = childColSpan(child);
        // colSpan is out of 12; subtract the gap so N columns fit on one row.
        const flex = colSpan
          ? `0 1 calc(${((colSpan / 12) * 100).toFixed(4)}% - ${gap})`
          : '1 1 0';
        return (
          <div key={index} style={{ flex, minWidth: 140, boxSizing: 'border-box' }}>
            <JsonFormsDispatch
              uischema={child}
              schema={schema}
              path={path}
              enabled={enabled}
              renderers={renderers}
              cells={cells}
            />
          </div>
        );
      })}
    </div>
  );
}

export const omfHorizontalTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('HorizontalLayout'));
export const OmfHorizontalLayoutControl: ComponentType<any> =
  withJsonFormsLayoutProps(OmfHorizontalLayout);

// --- table layout (left label column + right field cells, bordered) --------
//
// For paper forms built as a grid where each row has a bold category label in a
// left column and its fields in a right column (e.g. Αλλεργίες | Latex …), the
// AI emits an `OmfTableLayout` whose `elements` are `OmfTableRow`s. Each row is
// { label, elements }. This renders a real bordered <table> so the left labels
// line up as a column and every row's borders align — matching the paper.

interface OmfTableRowShape {
  label?: string;
  elements?: UISchemaElement[];
}

function OmfTableLayout(props: LayoutProps) {
  const { uischema, schema, path, visible, enabled, renderers, cells } = props;
  if (!visible) return null;
  const rows = ((uischema as Layout).elements ?? []) as unknown as OmfTableRowShape[];
  const border = 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)';
  const pad = 'var(--omf-control-padding, 8px)';
  return (
    <table
      style={{
        width: '100%',
        borderCollapse: 'collapse',
        marginBottom: 'var(--omf-section-gap, 16px)',
        tableLayout: 'fixed',
      }}
    >
      <tbody>
        {rows.map((row, r) => (
          <tr key={r}>
            <td
              style={{
                border,
                background: 'var(--omf-color-section-bg, #f7f8fa)',
                width: 'var(--omf-table-label-width, 16%)',
                verticalAlign: 'top',
                padding: pad,
                fontWeight: 'var(--omf-label-weight, 600)' as never,
                fontSize: 'var(--omf-font-size-label, 13px)',
                color: 'var(--omf-color-label, #3a4552)',
              }}
            >
              {row.label}
            </td>
            <td style={{ border, verticalAlign: 'top', padding: pad }}>
              {(row.elements ?? []).map((child, index) => (
                <JsonFormsDispatch
                  key={index}
                  uischema={child}
                  schema={schema}
                  path={path}
                  enabled={enabled}
                  renderers={renderers}
                  cells={cells}
                />
              ))}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export const omfTableTester = rankWith(OMF_CONTROL_RANK, uiTypeIs('OmfTableLayout'));
export const OmfTableLayoutControl: ComponentType<any> = withJsonFormsLayoutProps(OmfTableLayout);
