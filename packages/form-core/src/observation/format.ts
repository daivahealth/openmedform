/**
 * Display formatting for observations, shared by both renderers so a
 * previous-value chip reads identically in React and Angular (ADR-005).
 *
 * Pure functions; the clock is injected so tests are deterministic.
 */

import type { Observation } from '@openmedform/form-schema-types';

/** True when the host marked this reading as superseded by a later correction. */
export function isSuperseded(obs: Observation): boolean {
  return obs.source?.superseded === true;
}

/** The author a host attached, if any (`source.author`). */
export function observationAuthor(obs: Observation): string | undefined {
  const a = obs.source?.author;
  return typeof a === 'string' && a.length > 0 ? a : undefined;
}

export interface FormatValueOptions {
  /** Append the unit (default true). */
  unit?: boolean;
}

/**
 * UCUM code → the symbol a clinician expects to read. UCUM is what `omf.unit`
 * stores and what FHIR wants (`valueQuantity.code`); `[degF]` on a ward chart
 * is not. Only display changes — the stored unit is never altered, and an
 * unknown code passes through unchanged so nothing is ever hidden.
 */
const UCUM_DISPLAY: Record<string, string> = {
  Cel: '°C',
  '[degF]': '°F',
  'mm[Hg]': 'mmHg',
  '/min': '/min',
  '{beats}/min': 'bpm',
  '{breaths}/min': '/min',
  '%': '%',
  kg: 'kg',
  g: 'g',
  cm: 'cm',
  m: 'm',
  'kg/m2': 'kg/m²',
  'mg/dL': 'mg/dL',
  'mmol/L': 'mmol/L',
  'umol/L': 'µmol/L',
  'meq/L': 'mEq/L',
  'g/dL': 'g/dL',
  'g/L': 'g/L',
  'ng/mL': 'ng/mL',
  'ug/L': 'µg/L',
  'U/L': 'U/L',
  'IU/L': 'IU/L',
  kPa: 'kPa',
  'L/min': 'L/min',
  mL: 'mL',
  'mL/h': 'mL/h',
  'mL/kg/h': 'mL/kg/h',
  fL: 'fL',
  pg: 'pg',
  '10*9/L': '×10⁹/L',
  '10*12/L': '×10¹²/L',
  '10*3/uL': '×10³/µL',
  '10*6/uL': '×10⁶/µL',
  '[in_i]': 'in',
  '[lb_av]': 'lb',
  '[oz_av]': 'oz',
  '{score}': '',
};

/** The display symbol for a UCUM unit code; the code itself when there is no mapping. */
export function displayUnit(ucum: string | undefined): string {
  if (!ucum) return '';
  return ucum in UCUM_DISPLAY ? UCUM_DISPLAY[ucum] : ucum;
}

/**
 * The value as a clinician reads it: the option label for a coded answer,
 * Yes/No for a boolean, the number (or text) otherwise, with the unit.
 */
export function formatObservationValue(obs: Observation, opts: FormatValueOptions = {}): string {
  const withUnit = opts.unit ?? true;
  if (obs.valueLabel) return obs.valueLabel;
  if (typeof obs.value === 'boolean') return obs.value ? 'Yes' : 'No';
  const text = String(obs.value);
  const unit = withUnit ? displayUnit(obs.unit) : '';
  return unit ? `${text} ${unit}` : text;
}

const MINUTE = 60_000;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;

/**
 * "just now", "35m ago", "2h ago", "3d ago" — coarse on purpose: a chip is a
 * glance, the popover carries the clock time. Future timestamps read as
 * "in 2h". Unparseable input yields ''.
 */
export function relativeAge(iso: string, nowMs: number = Date.now()): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  const diff = nowMs - t;
  const abs = Math.abs(diff);
  let text: string;
  if (abs < MINUTE) return 'just now';
  if (abs < HOUR) text = `${Math.floor(abs / MINUTE)}m`;
  else if (abs < DAY) text = `${Math.floor(abs / HOUR)}h`;
  else text = `${Math.floor(abs / DAY)}d`;
  return diff >= 0 ? `${text} ago` : `in ${text}`;
}

export interface ClockOptions {
  locale?: string;
  timeZone?: string;
}

/** "14:00" — 24-hour clock, the ward convention. */
export function formatClock(iso: string, opts: ClockOptions = {}): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat(opts.locale, {
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(t);
}

/** "15 Sep" — a flowsheet column's day, when columns span more than one. */
export function formatDay(iso: string, opts: ClockOptions = {}): string {
  const t = Date.parse(iso);
  if (Number.isNaN(t)) return '';
  return new Intl.DateTimeFormat(opts.locale ?? 'en-GB', {
    day: 'numeric',
    month: 'short',
    ...(opts.timeZone ? { timeZone: opts.timeZone } : {}),
  }).format(t);
}

/** Same calendar day in the given zone? Decides whether a column needs its date. */
export function sameDay(aIso: string, bIso: string, opts: ClockOptions = {}): boolean {
  return formatDay(aIso, opts) === formatDay(bIso, opts) && new Date(aIso).getUTCFullYear() === new Date(bIso).getUTCFullYear();
}
