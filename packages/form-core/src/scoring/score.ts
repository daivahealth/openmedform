/**
 * Clinical scoring for the jsonforms engine — framework-independent.
 *
 * A scored form carries its point values on the UI element, in one of two
 * shapes depending on what the paper does:
 *
 * - `options.omf.points` — one number for a tick-box row ("Acute MI …… 1").
 *   Contributes when the box is ticked.
 * - `options.omf.optionPoints` — a code→points map for a single-select whose
 *   *choice* carries the score (Morse Fall's "Ambulatory aid": none 0,
 *   crutches 15, furniture 30). Contributes the selected option's points.
 *
 * This module is the SINGLE source of truth for turning either shape + the
 * current response into a total:
 *
 * - the React/Angular renderers call `computeScore` for the LIVE, on-screen
 *   running total and per-section subtotals (a clinician aid only), and
 * - the backend derives the same items to recompute the AUTHORITATIVE score on
 *   submission (client totals are never trusted — see Form Engine Rules).
 *
 * Because both sides read the same `omf.points` off the same UI schema, the
 * live aid and the stored score cannot drift.
 *
 * Pure functions over plain objects — no Angular/React, no I/O.
 */

import type { UiSchema, UiSchemaElement } from '@openmedform/form-schema-types';
import { scopeToDataPath } from '../schema/pointer';
import { elementOptionPoints } from '../schema/enum-options';
import { getValueAtScope } from '../binding/data-path';

/** A single scored control discovered in the UI schema. */
export interface ScoreItem {
  /** JSON Forms scope, e.g. '#/properties/age/properties/age75plus'. */
  scope: string;
  /** Dotted data path, e.g. 'age.age75plus'. */
  path: string;
  /** Points contributed when the control is ticked. 0 for a scored select. */
  points: number;
  /**
   * For a scored single-select: what each enum code contributes. When present
   * this takes precedence over `points`, and the contribution depends on which
   * option is selected rather than on whether anything is.
   */
  optionPoints?: Record<string, number>;
  /** Nearest ancestor Group label, if any (used for per-section subtotals). */
  section?: string;
}

/**
 * A risk-stratification band. A band matches when the total is within
 * [minScore, maxScore] (either bound optional; both inclusive).
 */
export interface RiskBand {
  minScore?: number;
  maxScore?: number;
  label: string;
  color?: string;
}

export interface ScoreBreakdown {
  total: number;
  /** Subtotal per section label (only sections with scored items appear). */
  bySection: Record<string, number>;
  riskLabel?: string;
  riskColor?: string;
}

/** Read a numeric `options.omf.points` off a UI element, if present. */
function elementPoints(el: UiSchemaElement): number | undefined {
  const p = (el as { options?: { omf?: { points?: unknown } } }).options?.omf?.points;
  return typeof p === 'number' ? p : undefined;
}

/** Read the `options.omf.bands` risk table off a UI element, if present. */
export function elementBands(el: UiSchemaElement): RiskBand[] | undefined {
  const b = (el as { options?: { omf?: { bands?: unknown } } }).options?.omf?.bands;
  return Array.isArray(b) ? (b as RiskBand[]) : undefined;
}

function children(el: UiSchemaElement): UiSchemaElement[] {
  return ((el as { elements?: UiSchemaElement[] }).elements ?? []) as UiSchemaElement[];
}

function groupLabel(el: UiSchemaElement): string | undefined {
  return el.type === 'Group' && typeof el.label === 'string' ? el.label : undefined;
}

/**
 * Walk a UI schema (root element or a `{ layout }` wrapper) and collect every
 * scored control — `options.omf.points` or `options.omf.optionPoints` — tagged
 * with its nearest Group section.
 */
export function collectScoreItems(uiSchema: UiSchema | UiSchemaElement): ScoreItem[] {
  const root = (uiSchema as UiSchema).layout ?? (uiSchema as UiSchemaElement);
  const items: ScoreItem[] = [];

  const walk = (el: UiSchemaElement, section: string | undefined): void => {
    const nextSection = groupLabel(el) ?? section;
    const scope = (el as { scope?: string }).scope;
    const points = elementPoints(el);
    const optionPoints = elementOptionPoints(el);
    if (typeof scope === 'string' && (typeof points === 'number' || optionPoints)) {
      items.push({
        scope,
        path: scopeToDataPath(scope),
        points: points ?? 0,
        ...(optionPoints ? { optionPoints } : {}),
        section: nextSection,
      });
    }
    for (const child of children(el)) walk(child, nextSection);
  };

  walk(root, undefined);
  return items;
}

/** True when a stored value counts as "ticked/present" for scoring. */
function isPresent(value: unknown): boolean {
  return value === true || value === 1 || value === '1' || value === 'yes' ||
    (typeof value === 'number' && value > 0);
}

/**
 * What one scored control contributes, or undefined when it contributes
 * nothing at all (unticked box, unanswered select, code absent from the map).
 *
 * A select answered with a legitimately-zero option returns 0 rather than
 * undefined: it has been answered, so its section counts as engaged.
 */
function contribution(item: ScoreItem, value: unknown): number | undefined {
  if (item.optionPoints) {
    if (value == null) return undefined;
    const points = item.optionPoints[String(value)];
    return typeof points === 'number' ? points : undefined;
  }
  return isPresent(value) ? item.points : undefined;
}

/** Resolve the risk band whose range contains `total`. */
export function stratify(total: number, bands: RiskBand[] | undefined): RiskBand | undefined {
  if (!bands?.length) return undefined;
  return bands.find(
    (b) =>
      (b.minScore == null || total >= b.minScore) &&
      (b.maxScore == null || total <= b.maxScore),
  );
}

/**
 * Compute the grand total, per-section subtotals, and (if bands are supplied)
 * the risk label/colour from the current response data.
 */
export function computeScore(
  items: ScoreItem[],
  data: unknown,
  bands?: RiskBand[],
): ScoreBreakdown {
  let total = 0;
  const bySection: Record<string, number> = {};
  for (const item of items) {
    const points = contribution(item, getValueAtScope(data, item.scope));
    if (points === undefined) continue;
    total += points;
    if (item.section) bySection[item.section] = (bySection[item.section] ?? 0) + points;
  }
  const band = stratify(total, bands);
  return { total, bySection, riskLabel: band?.label, riskColor: band?.color };
}

/** Convenience: derive items straight from a UI schema and compute in one call. */
export function scoreUiSchema(
  uiSchema: UiSchema | UiSchemaElement,
  data: unknown,
  bands?: RiskBand[],
): ScoreBreakdown {
  return computeScore(collectScoreItems(uiSchema), data, bands);
}
