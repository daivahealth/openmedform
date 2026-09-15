/**
 * Trend preparation — the numbers a previous-value chip and a sparkline need,
 * derived once so React and Angular draw the same thing (ADR-005).
 *
 * Only numeric observations trend. A field whose values are codes or text has
 * a history list but no line and no arrow.
 */

import type { Observation } from '@openmedform/form-schema-types';

export interface TrendPoint {
  /** Epoch milliseconds of `effectiveAt`. */
  t: number;
  v: number;
  unit?: string;
}

function numericValue(o: Observation): number | undefined {
  if (typeof o.value === 'number') return Number.isFinite(o.value) ? o.value : undefined;
  if (typeof o.value === 'string' && o.value.trim() !== '') {
    const n = Number(o.value);
    return Number.isFinite(n) ? n : undefined;
  }
  return undefined;
}

/**
 * Numeric points in ascending time order — the x/y a sparkline plots.
 * Non-numeric observations and unparseable timestamps are skipped.
 */
export function trendPoints(observations: Observation[]): TrendPoint[] {
  const points: TrendPoint[] = [];
  for (const o of observations) {
    const v = numericValue(o);
    const t = Date.parse(o.effectiveAt);
    if (v === undefined || Number.isNaN(t)) continue;
    points.push({ t, v, ...(o.unit ? { unit: o.unit } : {}) });
  }
  return points.sort((a, b) => a.t - b.t);
}

export type TrendDirection = 'up' | 'down' | 'same';

export interface Delta {
  direction: TrendDirection;
  /** `current - previous`, signed. */
  delta: number;
  /**
   * True when the two readings carry different units. Show both with their
   * units and do NOT draw an arrow — the delta is meaningless.
   */
  unitMismatch: boolean;
}

/**
 * The change from the most recent prior reading to `current`. Undefined when
 * either side is not numeric or there is no prior reading.
 */
export function latestDelta(
  current: Observation | number,
  previous: Observation | undefined,
): Delta | undefined {
  if (!previous) return undefined;
  const cur =
    typeof current === 'number' ? current : numericValue(current);
  const prev = numericValue(previous);
  if (cur === undefined || prev === undefined) return undefined;
  const curUnit = typeof current === 'number' ? undefined : current.unit;
  const unitMismatch = Boolean(curUnit && previous.unit && curUnit !== previous.unit);
  const delta = cur - prev;
  return {
    direction: delta > 0 ? 'up' : delta < 0 ? 'down' : 'same',
    delta,
    unitMismatch,
  };
}

/**
 * Do the observations carry more than one distinct unit? A flowsheet row
 * uses this to switch from "value" to "value unit" cells.
 */
export function hasMixedUnits(observations: Observation[]): boolean {
  const units = new Set(observations.map((o) => o.unit ?? ''));
  return units.size > 1;
}
