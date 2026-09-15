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
 * The value as a clinician reads it: the option label for a coded answer,
 * Yes/No for a boolean, the number (or text) otherwise, with the unit.
 */
export function formatObservationValue(obs: Observation, opts: FormatValueOptions = {}): string {
  const withUnit = opts.unit ?? true;
  if (obs.valueLabel) return obs.valueLabel;
  if (typeof obs.value === 'boolean') return obs.value ? 'Yes' : 'No';
  const text = String(obs.value);
  return withUnit && obs.unit ? `${text} ${obs.unit}` : text;
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
