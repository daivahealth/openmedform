import { describe, expect, it } from 'vitest';

import type { Observation } from '@openmedform/form-schema-types';
import { displayUnit, formatClock, formatDay, formatObservationValue, isSuperseded, observationAuthor, relativeAge, sameDay } from './format';

const NOW = Date.parse('2026-09-15T14:00:00Z');
const base: Observation = { path: 'v.hr', label: 'HR', value: 88, unit: '/min', effectiveAt: '2026-09-15T12:00:00Z' };

describe('formatObservationValue', () => {
  it('prefers the option label, then Yes/No, then value with unit', () => {
    expect(formatObservationValue({ ...base, value: 'ALERT', valueLabel: 'Alert' })).toBe('Alert');
    expect(formatObservationValue({ ...base, value: true })).toBe('Yes');
    expect(formatObservationValue(base)).toBe('88 /min');
    expect(formatObservationValue(base, { unit: false })).toBe('88');
    expect(formatObservationValue({ ...base, unit: undefined })).toBe('88');
  });

  it('shows the clinical symbol for a UCUM code, never the raw code', () => {
    expect(formatObservationValue({ ...base, value: 98.6, unit: '[degF]' })).toBe('98.6 °F');
    expect(formatObservationValue({ ...base, value: 37, unit: 'Cel' })).toBe('37 °C');
    expect(formatObservationValue({ ...base, value: 138, unit: 'mm[Hg]' })).toBe('138 mmHg');
  });
});

describe('displayUnit', () => {
  it('maps common UCUM codes and passes unknown ones through', () => {
    expect(displayUnit('Cel')).toBe('°C');
    expect(displayUnit('10*9/L')).toBe('×10⁹/L');
    expect(displayUnit('umol/L')).toBe('µmol/L');
    expect(displayUnit('furlongs')).toBe('furlongs');
    expect(displayUnit(undefined)).toBe('');
  });
});

describe('relativeAge', () => {
  it('is coarse and reads like a ward chart', () => {
    expect(relativeAge('2026-09-15T13:59:40Z', NOW)).toBe('just now');
    expect(relativeAge('2026-09-15T13:25:00Z', NOW)).toBe('35m ago');
    expect(relativeAge('2026-09-15T12:00:00Z', NOW)).toBe('2h ago');
    expect(relativeAge('2026-09-12T12:00:00Z', NOW)).toBe('3d ago');
    expect(relativeAge('2026-09-15T16:00:00Z', NOW)).toBe('in 2h');
    expect(relativeAge('nope', NOW)).toBe('');
  });
});

describe('clock and day', () => {
  it('formats a 24-hour clock and a short day in a fixed zone', () => {
    expect(formatClock('2026-09-15T14:05:00Z', { timeZone: 'UTC' })).toBe('14:05');
    expect(formatDay('2026-09-15T14:05:00Z', { timeZone: 'UTC' })).toBe('15 Sept');
    expect(sameDay('2026-09-15T01:00:00Z', '2026-09-15T23:00:00Z', { timeZone: 'UTC' })).toBe(true);
    expect(sameDay('2026-09-15T01:00:00Z', '2026-09-16T01:00:00Z', { timeZone: 'UTC' })).toBe(false);
  });
});

describe('source conventions', () => {
  it('reads author and superseded off the opaque source bag', () => {
    expect(observationAuthor({ ...base, source: { author: 'RN Priya' } })).toBe('RN Priya');
    expect(observationAuthor(base)).toBeUndefined();
    expect(isSuperseded({ ...base, source: { superseded: true } })).toBe(true);
    expect(isSuperseded(base)).toBe(false);
  });
});
