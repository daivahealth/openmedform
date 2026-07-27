/**
 * scoreSummary — a live, cross-section total for scored clinical checklists.
 *
 * Selected via `options.omf.control === 'scoreSummary'`. It reads the WHOLE
 * form response and the root UI schema from the JSON Forms context, sums every
 * ticked `options.omf.points` across all sections via form-core's single
 * scoring source of truth, and shows the grand total, per-section subtotals,
 * and (if `options.omf.bands` are supplied) the risk band. This is a clinician
 * aid — the server recomputes the authoritative score on submission.
 */

import { useMemo, type ComponentType } from 'react';
import type { ControlProps, UISchemaElement } from '@jsonforms/core';
import { rankWith } from '@jsonforms/core';
import { useJsonForms, withJsonFormsControlProps } from '@jsonforms/react';
import { collectScoreItems, computeScore, type RiskBand } from '@openmedform/form-core';
import type { UiSchema } from '@openmedform/form-schema-types';
import { OMF_CONTROL_RANK, omfControlIs, readOmf } from '../testers';

function OmfScoreSummary(props: ControlProps) {
  const { label, visible, uischema } = props;
  const ctx = useJsonForms();

  const rootUi = ctx.core?.uischema as unknown as UiSchema | UISchemaElement | undefined;
  const data = ctx.core?.data ?? {};
  const bands = (readOmf(uischema)?.bands as RiskBand[] | undefined) ?? undefined;
  // The UI schema is static; only re-walk it when its reference changes. The
  // component re-renders on every JsonForms state change (validation/focus/…),
  // so memoizing keeps the work to actual data/schema changes.
  const items = useMemo(() => (rootUi ? collectScoreItems(rootUi as never) : []), [rootUi]);
  const { total, bySection, riskLabel, riskColor } = useMemo(
    () => computeScore(items, data, bands),
    [items, data, bands],
  );
  const sections = Object.entries(bySection);

  if (!visible) return null;

  return (
    <div
      style={{
        border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
        borderRadius: 'var(--omf-border-radius, 4px)',
        marginBottom: 'var(--omf-section-gap, 16px)',
        overflow: 'hidden',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'baseline',
          justifyContent: 'space-between',
          gap: 12,
          background: 'var(--omf-color-section-bg, #f7f8fa)',
          borderBottom: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
          padding: 'var(--omf-control-padding, 8px)',
        }}
      >
        <span
          style={{
            fontWeight: 'var(--omf-label-weight, 600)' as never,
            fontSize: 'var(--omf-font-size-label, 13px)',
            color: 'var(--omf-color-label, #3a4552)',
          }}
        >
          {label || 'Total Score'}
        </span>
        <span style={{ display: 'inline-flex', alignItems: 'baseline', gap: 10 }}>
          <span style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{total}</span>
          {riskLabel ? (
            <span
              style={{
                padding: '2px 10px',
                borderRadius: 999,
                border: `1px solid ${riskColor ?? '#3a4552'}`,
                background: `${riskColor ?? '#3a4552'}22`,
                color: riskColor ?? '#3a4552',
                fontSize: 'var(--omf-font-size-help, 12px)',
                fontWeight: 700,
              }}
            >
              {riskLabel}
            </span>
          ) : null}
        </span>
      </div>

      {sections.length ? (
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 'var(--omf-font-size-body, 14px)' }}>
          <tbody>
            {sections.map(([name, subtotal]) => (
              <tr key={name}>
                <td style={{ padding: 'var(--omf-control-padding, 8px)', color: 'var(--omf-color-label, #3a4552)' }}>
                  {name}
                </td>
                <td style={{ padding: 'var(--omf-control-padding, 8px)', textAlign: 'right', fontWeight: 600, width: 80 }}>
                  {subtotal}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      ) : null}

      <div
        style={{
          padding: 'var(--omf-control-padding, 8px)',
          fontSize: 'var(--omf-font-size-help, 12px)',
          color: 'var(--omf-color-help, #6b7684)',
        }}
      >
        Live total — the server recalculates the authoritative score on submission.
      </div>
    </div>
  );
}

export const scoreSummaryTester = rankWith(OMF_CONTROL_RANK, omfControlIs('scoreSummary'));
export const ScoreSummaryControl: ComponentType<any> = withJsonFormsControlProps(OmfScoreSummary);
