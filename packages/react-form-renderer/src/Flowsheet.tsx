/**
 * Flowsheet — parameters down the left, one column per occurrence across the
 * top, newest first (ADR-005 §4). A host mounts it on its own "Vitals" tab and
 * hands it the same prior fills (or observations) it gives the form.
 *
 * Thin: the grid model comes from form-core's `buildFlowsheet`, so twelve
 * separate responses and one recordTable-column response produce the same
 * table here and in the Angular renderer. Styled with `--omf-*` tokens only.
 */

import { useMemo, type CSSProperties } from 'react';
import { cssVariables } from '@openmedform/form-design-tokens';
import type { FormDefinitionSchemas, HistoryEntry, Observation } from '@openmedform/form-schema-types';
import {
  buildFlowsheet,
  displayUnit,
  formatClock,
  formatDay,
  formatObservationValue,
  projectObservations,
  sameDay,
} from '@openmedform/form-core';

export interface FlowsheetProps {
  definition: FormDefinitionSchemas;
  /** Prior fills as the host stored them; projected against their own definition. */
  entries?: HistoryEntry[];
  /** Already-projected readings (e.g. from the host's FHIR store). May be combined with `entries`. */
  observations?: Observation[];
  /** Newest N columns only. Default: all. */
  maxColumns?: number;
  /** Keep rows for fields with no readings (a blank chart). Default false. */
  includeEmptyRows?: boolean;
  title?: string;
  /** Shown when there is nothing to chart. */
  emptyLabel?: string;
  /** IANA time zone for the column clocks. Default: the viewer's. */
  timeZone?: string;
}

const tokenStyle = cssVariables as unknown as CSSProperties;
const BORDER = 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)';
const PAD = '6px 10px';

export function Flowsheet({
  definition,
  entries,
  observations,
  maxColumns,
  includeEmptyRows,
  title,
  emptyLabel = 'No previous readings',
  timeZone,
}: FlowsheetProps) {
  const sheet = useMemo(() => {
    const all: Observation[] = [...(observations ?? [])];
    for (const e of entries ?? []) {
      const source = { ...(e.author ? { author: e.author } : {}), ...(e.source ?? {}) };
      all.push(
        ...projectObservations(e.definition ?? definition, e.data, {
          effectiveAt: e.effectiveAt,
          ...(Object.keys(source).length > 0 ? { source } : {}),
        }),
      );
    }
    return buildFlowsheet(definition, all, { maxColumns, includeEmptyRows });
  }, [definition, entries, observations, maxColumns, includeEmptyRows]);

  const clockOpts = timeZone ? { timeZone } : {};
  const multiDay =
    sheet.columns.length > 1 &&
    !sheet.columns.every((c) => sameDay(c.effectiveAt, sheet.columns[0].effectiveAt, clockOpts));

  return (
    <div
      className="omf-flowsheet"
      style={{ ...tokenStyle, fontFamily: 'var(--omf-font-family)', color: 'var(--omf-color-text, #1c2430)', minWidth: 0, maxWidth: '100%' }}
    >
      {title ? (
        <h3 style={{ margin: '0 0 8px', fontSize: 'var(--omf-font-size-section-title, 15px)' }}>{title}</h3>
      ) : null}
      {sheet.columns.length === 0 ? (
        <p style={{ margin: 0, fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-label, #3a4552)' }}>
          {emptyLabel}
        </p>
      ) : (
        <div className="omf-scroll-x" style={{ overflowX: 'auto', minWidth: 0, maxWidth: '100%' }}>
          <table style={{ borderCollapse: 'separate', borderSpacing: 0, fontSize: 'var(--omf-font-size-body, 14px)' }}>
            <thead>
              <tr>
                <th
                  scope="col"
                  style={{
                    position: 'sticky',
                    left: 0,
                    zIndex: 1,
                    background: 'var(--omf-color-section-bg, #f7f8fa)',
                    border: BORDER,
                    padding: PAD,
                    textAlign: 'left',
                    fontSize: 'var(--omf-font-size-label, 13px)',
                    color: 'var(--omf-color-label, #3a4552)',
                    minWidth: 160,
                  }}
                >
                  Parameter
                </th>
                {sheet.columns.map((col) => (
                  <th
                    key={col.effectiveAt}
                    scope="col"
                    style={{
                      border: BORDER,
                      borderLeft: 'none',
                      padding: PAD,
                      background: 'var(--omf-color-section-bg, #f7f8fa)',
                      textAlign: 'center',
                      whiteSpace: 'nowrap',
                      fontWeight: 600,
                      fontSize: 'var(--omf-font-size-label, 13px)',
                    }}
                    title={col.effectiveAt}
                  >
                    <div>{formatClock(col.effectiveAt, clockOpts)}</div>
                    {multiDay ? (
                      <div style={{ fontWeight: 400, fontSize: 'var(--omf-font-size-help, 12px)' }}>
                        {formatDay(col.effectiveAt, clockOpts)}
                      </div>
                    ) : null}
                    {col.authors.length > 0 ? (
                      <div style={{ fontWeight: 400, fontSize: 'var(--omf-font-size-help, 12px)', color: 'var(--omf-color-label, #3a4552)' }}>
                        {col.authors.join(', ')}
                      </div>
                    ) : null}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.sections.map((section, si) => (
                <SectionRows key={si} section={section} columnCount={sheet.columns.length} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function SectionRows({
  section,
  columnCount,
}: {
  section: ReturnType<typeof buildFlowsheet>['sections'][number];
  columnCount: number;
}) {
  return (
    <>
      {section.label ? (
        <tr className="omf-flowsheet-section">
          <th
            scope="rowgroup"
            colSpan={columnCount + 1}
            style={{
              position: 'sticky',
              left: 0,
              border: BORDER,
              borderTop: 'none',
              padding: '4px 10px',
              textAlign: 'left',
              background: 'var(--omf-color-section-bg, #f7f8fa)',
              fontSize: 'var(--omf-font-size-help, 12px)',
              letterSpacing: 0.4,
              textTransform: 'uppercase',
              color: 'var(--omf-color-label, #3a4552)',
            }}
          >
            {section.label}
          </th>
        </tr>
      ) : null}
      {section.rows.map((row) => (
        <tr key={row.key} className="omf-flowsheet-row">
          <th
            scope="row"
            style={{
              position: 'sticky',
              left: 0,
              zIndex: 1,
              background: '#fff',
              border: BORDER,
              borderTop: 'none',
              padding: PAD,
              textAlign: 'left',
              fontWeight: 600,
              whiteSpace: 'nowrap',
            }}
          >
            {row.label}
            {row.unit && !row.mixedUnits ? (
              <span style={{ marginLeft: 6, fontWeight: 400, color: 'var(--omf-color-label, #3a4552)' }}>{displayUnit(row.unit)}</span>
            ) : null}
          </th>
          {row.cells.map((cell, ci) => (
            <td
              key={ci}
              style={{
                border: BORDER,
                borderTop: 'none',
                borderLeft: 'none',
                padding: PAD,
                textAlign: 'center',
                whiteSpace: 'nowrap',
                // The sheet is its own white surface: a host page may be dark,
                // and a token-coloured value on an inherited dark ground is
                // unreadable. Same reason the header/sticky cells paint theirs.
                background: '#fff',
              }}
            >
              {cell.superseded.map((o, i) => (
                <s key={i} style={{ color: 'var(--omf-color-label, #3a4552)', marginRight: 6 }} title="Superseded">
                  {formatObservationValue(o, { unit: row.mixedUnits })}
                </s>
              ))}
              {cell.text}
            </td>
          ))}
        </tr>
      ))}
    </>
  );
}
