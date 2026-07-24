/**
 * Clinical custom controls for the JSON Forms engine.
 *
 * These are the JSON Forms counterparts of the six Form.io clinical components.
 * Configuration (domains, rows, columns, thresholds, headers) rides on the UI
 * element under `options.omf`; the bound value rides on the data at the control
 * scope. Interactive controls (scoringMatrix, signatureDate) write back through
 * JSON Forms' `handleChange`; the rest are display/reference controls.
 *
 * Server-side scoring is authoritative (Form Engine Rules); scoringMatrix shows
 * a live subtotal only as an author/clinician aid, never as the source of truth.
 */

import { Fragment } from 'react';
import type { ComponentType } from 'react';
import type { ControlProps } from '@jsonforms/core';
import { rankWith } from '@jsonforms/core';
import { withJsonFormsControlProps } from '@jsonforms/react';
import { FieldFrame } from './field-frame';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

const tableStyle: React.CSSProperties = {
  width: '100%',
  borderCollapse: 'collapse',
  fontSize: 'var(--omf-font-size-body, 14px)',
};
const cellStyle: React.CSSProperties = {
  border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
  padding: 'var(--omf-control-padding, 8px)',
  textAlign: 'left',
};

interface ScoringItem {
  field: string;
  label?: string;
  points?: number;
}
interface ScoringDomain {
  name?: string;
  items?: ScoringItem[];
}

// --- scoringMatrix (interactive) --------------------------------------------

function ScoringMatrix(props: ControlProps) {
  const { id, label, data, enabled, visible, errors, path, handleChange, uischema } = props;
  if (!visible) return null;
  const domains = (readOmf(uischema)?.domains as ScoringDomain[] | undefined) ?? [];
  const value = (data as Record<string, boolean>) ?? {};
  let total = 0;

  const toggle = (field: string, checked: boolean) => {
    handleChange(path, { ...value, [field]: checked });
  };

  return (
    <FieldFrame id={id} label={label} errors={errors}>
      <table style={tableStyle}>
        <thead>
          <tr>
            <th style={cellStyle}>Risk Factor</th>
            <th style={cellStyle}>Points</th>
            <th style={cellStyle}>Present</th>
          </tr>
        </thead>
        <tbody>
          {domains.map((domain, di) => (
            <Fragment key={`d-${di}`}>
              {domain.name ? (
                <tr>
                  <td style={{ ...cellStyle, background: 'var(--omf-color-section-bg, #f7f8fa)' }} colSpan={3}>
                    <strong>{domain.name}</strong>
                  </td>
                </tr>
              ) : null}
              {(domain.items ?? []).map((item) => {
                const checked = !!value[item.field];
                if (checked) total += item.points ?? 0;
                return (
                  <tr key={item.field}>
                    <td style={cellStyle}>{item.label ?? item.field}</td>
                    <td style={cellStyle}>{item.points ?? 0}</td>
                    <td style={cellStyle}>
                      <input
                        type="checkbox"
                        checked={checked}
                        disabled={!enabled}
                        onChange={(e) => toggle(item.field, e.target.checked)}
                      />
                    </td>
                  </tr>
                );
              })}
            </Fragment>
          ))}
        </tbody>
        <tfoot>
          <tr>
            <td style={cellStyle} colSpan={2}>
              <strong>Subtotal (server recalculates)</strong>
            </td>
            <td style={cellStyle}>
              <strong>{total}</strong>
            </td>
          </tr>
        </tfoot>
      </table>
    </FieldFrame>
  );
}
export const scoringMatrixTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoringMatrix'));
export const ScoringMatrixControl: ComponentType<any> = withJsonFormsControlProps(ScoringMatrix);

// --- signatureDate (interactive) --------------------------------------------

function SignatureDate(props: ControlProps) {
  const { id, label, data, enabled, visible, errors, path, handleChange } = props;
  if (!visible) return null;
  const value = (data as { printedName?: string; date?: string }) ?? {};
  const update = (patch: Partial<{ printedName: string; date: string }>) =>
    handleChange(path, { ...value, ...patch });

  return (
    <FieldFrame id={id} label={label} errors={errors}>
      <div style={{ display: 'flex', gap: 12, flexWrap: 'wrap' }}>
        <input
          type="text"
          placeholder="Printed name"
          value={value.printedName ?? ''}
          disabled={!enabled}
          onChange={(e) => update({ printedName: e.target.value })}
          style={{ flex: 1, minWidth: 160, padding: 'var(--omf-control-padding, 8px)' }}
        />
        <input
          type="date"
          value={value.date ?? ''}
          disabled={!enabled}
          onChange={(e) => update({ date: e.target.value })}
          style={{ padding: 'var(--omf-control-padding, 8px)' }}
        />
      </div>
    </FieldFrame>
  );
}
export const signatureDateTester = rankWith(OMF_CONTROL_RANK, omfControlIs('signatureDate'));
export const SignatureDateControl: ComponentType<any> = withJsonFormsControlProps(SignatureDate);

// --- vitalSignsChart (display of recorded rows) -----------------------------

interface VitalColumn {
  key: string;
  label?: string;
}
function VitalSignsChart(props: ControlProps) {
  const { id, label, data, visible, errors, uischema } = props;
  if (!visible) return null;
  const columns = (readOmf(uischema)?.columns as VitalColumn[] | undefined) ?? [];
  const rows = Array.isArray(data) ? (data as Record<string, unknown>[]) : [];
  return (
    <FieldFrame id={id} label={label} errors={errors}>
      <div style={{ overflowX: 'auto' }}>
        <table style={tableStyle}>
          <thead>
            <tr>
              {columns.map((c) => (
                <th key={c.key} style={cellStyle}>
                  {c.label ?? c.key}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, ri) => (
              <tr key={ri}>
                {columns.map((c) => (
                  <td key={c.key} style={cellStyle}>
                    {String(row[c.key] ?? '')}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </FieldFrame>
  );
}
export const vitalSignsChartTester = rankWith(OMF_CONTROL_RANK, omfControlIs('vitalSignsChart'));
export const VitalSignsChartControl: ComponentType<any> = withJsonFormsControlProps(VitalSignsChart);

// --- colorCodedGrid (reference display) -------------------------------------

interface ColorRow {
  label?: string;
  range?: string;
  color?: string;
}
function ColorCodedGrid(props: ControlProps) {
  const { id, label, visible, uischema } = props;
  if (!visible) return null;
  const rows = (readOmf(uischema)?.rows as ColorRow[] | undefined) ?? [];
  return (
    <FieldFrame id={id} label={label}>
      <table style={tableStyle}>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri} style={{ background: row.color ?? '#ffffff' }}>
              <td style={cellStyle}>{row.label ?? ''}</td>
              <td style={cellStyle}>{row.range ?? ''}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </FieldFrame>
  );
}
export const colorCodedGridTester = rankWith(OMF_CONTROL_RANK, omfControlIs('colorCodedGrid'));
export const ColorCodedGridControl: ComponentType<any> = withJsonFormsControlProps(ColorCodedGrid);

// --- clinicalReferenceTable (reference display) -----------------------------

function ClinicalReferenceTable(props: ControlProps) {
  const { id, label, visible, uischema } = props;
  if (!visible) return null;
  const omf = readOmf(uischema);
  const headers = (omf?.headers as string[] | undefined) ?? [];
  const rows = (omf?.rows as string[][] | undefined) ?? [];
  return (
    <FieldFrame id={id} label={label}>
      <table style={tableStyle}>
        <thead>
          <tr>
            {headers.map((h) => (
              <th key={h} style={cellStyle}>
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row, ri) => (
            <tr key={ri}>
              {row.map((cell, ci) => (
                <td key={ci} style={cellStyle}>
                  {cell}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </FieldFrame>
  );
}
export const clinicalReferenceTableTester = rankWith(OMF_CONTROL_RANK, omfControlIs('clinicalReferenceTable'));
export const ClinicalReferenceTableControl: ComponentType<any> = withJsonFormsControlProps(ClinicalReferenceTable);

// --- riskStratification (computed on submit) --------------------------------

function RiskStratification(props: ControlProps) {
  const { id, label, data, visible } = props;
  if (!visible) return null;
  const risk = data == null || data === '' ? 'Calculated on submission' : String(data);
  return (
    <FieldFrame id={id} label={label}>
      <div
        style={{
          padding: 'var(--omf-control-padding, 8px)',
          border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
          borderRadius: 'var(--omf-border-radius, 4px)',
          background: 'var(--omf-color-section-bg, #f7f8fa)',
        }}
      >
        {risk}
      </div>
    </FieldFrame>
  );
}
export const riskStratificationTester = rankWith(OMF_CONTROL_RANK, omfControlIs('riskStratification'));
export const RiskStratificationControl: ComponentType<any> = withJsonFormsControlProps(RiskStratification);
