/**
 * Previous-value chip + popover under a control (ADR-005 §4).
 *
 *   Previous 138 mm[Hg] · 2h ago · ↑ +6
 *
 * The chip is a glance; the popover carries the last N readings with clock
 * time and author, and a sparkline for numeric fields. All numbers come from
 * form-core (`latestDelta`, `trendPoints`, `relativeAge`) so the Angular chip
 * says the same thing. Styled with `--omf-*` tokens only.
 *
 * Renders nothing when the field has no history to show; renders a muted
 * "loading" / "unavailable" line while a provider is in flight or has failed,
 * and never blocks the control it sits under.
 */

import { useEffect, useId, useRef, useState, type CSSProperties } from 'react';
import type { UISchemaElement } from '@jsonforms/core';
import type { Observation } from '@openmedform/form-schema-types';
import {
  formatClock,
  formatObservationValue,
  hasMixedUnits,
  latestDelta,
  observationAuthor,
  relativeAge,
  trendPoints,
  type Delta,
} from '@openmedform/form-core';
import { useFieldHistory } from './history-context';

export interface FieldHistoryProps {
  path: string;
  uischema: UISchemaElement | undefined;
  /** The control's current value, for the delta arrow. */
  value?: unknown;
  /** The field label, for the popover's accessible name. */
  label?: string;
}

const muted: CSSProperties = {
  fontSize: 'var(--omf-font-size-help, 12px)',
  color: 'var(--omf-color-label, #3a4552)',
};

const chipButton: CSSProperties = {
  ...muted,
  display: 'inline-block',
  whiteSpace: 'nowrap',
  padding: '2px 8px',
  border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
  borderRadius: 'var(--omf-border-radius, 4px)',
  background: 'var(--omf-color-section-bg, #f7f8fa)',
  color: 'var(--omf-color-text, #1c2430)',
  cursor: 'pointer',
  lineHeight: 1.6,
  fontFamily: 'inherit',
};

function arrow(delta: Delta | undefined): string {
  if (!delta || delta.unitMismatch) return '';
  if (delta.direction === 'up') return '↑';
  if (delta.direction === 'down') return '↓';
  return '→';
}

function signed(n: number): string {
  const rounded = Math.round(n * 100) / 100;
  return rounded > 0 ? `+${rounded}` : String(rounded);
}

export function FieldHistory({ path, uischema, value, label }: FieldHistoryProps) {
  const state = useFieldHistory(path, uischema);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const popoverId = useId();

  // Close on Escape and on a click outside.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onClick);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('mousedown', onClick);
    };
  }, [open]);

  if (!state) return null;
  const { observations, config, loading, error } = state;
  const now = Date.now();

  if (observations.length === 0) {
    if (loading) return <span className="omf-history omf-history-loading" style={muted}>Loading previous values…</span>;
    if (error !== undefined) return <span className="omf-history omf-history-error" style={muted}>Previous values unavailable</span>;
    return null;
  }

  const previous = observations[0];
  const current = typeof value === 'number' || typeof value === 'string' ? Number(value) : NaN;
  const delta = Number.isFinite(current) && value !== '' ? latestDelta(current, previous) : undefined;
  const glyph = arrow(delta);
  const points = config.trend === false ? [] : trendPoints(observations);

  // Plain text with real spaces, so the visible chip and its accessible name
  // are the same string: "Previous 84 /min · 2h ago · ↑ +6".
  const summary =
    config.show === 'inline' ? (
      <>
        {'Previous '}
        <strong style={{ fontWeight: 600 }}>{formatObservationValue(previous)}</strong>
        {` · ${relativeAge(previous.effectiveAt, now)}`}
        {glyph ? ` · ${glyph} ${signed(delta!.delta)}` : ''}
        {delta?.unitMismatch ? (
          <span title="Units differ from the current field">{' · ⚠︎ units'}</span>
        ) : null}
      </>
    ) : (
      `History (${observations.length})`
    );

  return (
    <div ref={rootRef} className="omf-history" style={{ position: 'relative', display: 'inline-block', alignSelf: 'flex-start' }}>
      <button
        type="button"
        className="omf-history-chip"
        style={chipButton}
        aria-expanded={open}
        aria-controls={popoverId}
        onClick={() => setOpen((o) => !o)}
      >
        {summary}
      </button>
      {open ? (
        <div
          id={popoverId}
          role="region"
          aria-label={`Previous values${label ? ` for ${label}` : ''}`}
          className="omf-history-popover"
          style={{
            position: 'absolute',
            zIndex: 10,
            top: '100%',
            left: 0,
            marginTop: 4,
            minWidth: 240,
            padding: 10,
            border: 'var(--omf-border-width, 1px) solid var(--omf-color-border, #c8cdd4)',
            borderRadius: 'var(--omf-border-radius, 4px)',
            background: '#fff',
            boxShadow: '0 4px 14px rgba(0,0,0,0.12)',
            color: 'var(--omf-color-text, #1c2430)',
            fontSize: 'var(--omf-font-size-help, 12px)',
          }}
        >
          {points.length >= 2 ? <Sparkline points={points} /> : null}
          <HistoryList observations={observations} now={now} />
          {loading ? <div style={{ ...muted, marginTop: 6 }}>Refreshing…</div> : null}
        </div>
      ) : null}
    </div>
  );
}

function HistoryList({ observations, now }: { observations: Observation[]; now: number }) {
  const mixed = hasMixedUnits(observations);
  return (
    <table style={{ borderCollapse: 'collapse', width: '100%' }}>
      <tbody>
        {observations.map((o, i) => {
          const author = observationAuthor(o);
          return (
            <tr key={`${o.effectiveAt}-${i}`}>
              <td style={{ padding: '2px 8px 2px 0', whiteSpace: 'nowrap', color: 'var(--omf-color-label, #3a4552)' }}>
                {formatClock(o.effectiveAt)}
                <span style={{ marginLeft: 6, opacity: 0.8 }}>{relativeAge(o.effectiveAt, now)}</span>
              </td>
              <td style={{ padding: '2px 8px 2px 0', fontWeight: 600, whiteSpace: 'nowrap' }}>
                {formatObservationValue(o, { unit: mixed || i === 0 })}
              </td>
              <td style={{ padding: '2px 0', color: 'var(--omf-color-label, #3a4552)' }}>{author ?? ''}</td>
            </tr>
          );
        })}
      </tbody>
    </table>
  );
}

/** A tiny inline SVG line, oldest → newest, last point marked. */
function Sparkline({ points }: { points: ReturnType<typeof trendPoints> }) {
  const w = 220;
  const h = 36;
  const pad = 3;
  const ts = points.map((p) => p.t);
  const vs = points.map((p) => p.v);
  const t0 = Math.min(...ts);
  const t1 = Math.max(...ts);
  const v0 = Math.min(...vs);
  const v1 = Math.max(...vs);
  const x = (t: number) => (t1 === t0 ? w / 2 : pad + ((t - t0) / (t1 - t0)) * (w - 2 * pad));
  const y = (v: number) => (v1 === v0 ? h / 2 : h - pad - ((v - v0) / (v1 - v0)) * (h - 2 * pad));
  const d = points.map((p) => `${x(p.t).toFixed(1)},${y(p.v).toFixed(1)}`).join(' ');
  const last = points[points.length - 1];
  return (
    <svg
      className="omf-history-sparkline"
      viewBox={`0 0 ${w} ${h}`}
      width={w}
      height={h}
      role="img"
      aria-label={`Trend of ${points.length} readings from ${vs[0]} to ${last.v}`}
      style={{ display: 'block', marginBottom: 6 }}
    >
      <polyline points={d} fill="none" stroke="var(--omf-color-label, #3a4552)" strokeWidth={1.5} />
      <circle cx={x(last.t)} cy={y(last.v)} r={2.5} fill="var(--omf-color-text, #1c2430)" />
    </svg>
  );
}
