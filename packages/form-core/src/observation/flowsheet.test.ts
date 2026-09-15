import { describe, expect, it } from 'vitest';

import { buildFlowsheet } from './flowsheet';
import { projectObservations } from './project';
import { ICU_CHART, VITALS_V2, VITALS_V3 } from './fixtures.test-helpers';

const T = (h: number) => `2026-09-15T${String(h).padStart(2, '0')}:00:00Z`;

describe('buildFlowsheet', () => {
  const history = [
    ...projectObservations(VITALS_V2, { vitals: { pulse: 90, spo2: 96, avpu: 'ALERT' } }, { effectiveAt: T(10), source: { author: 'RN Priya' } }),
    ...projectObservations(VITALS_V2, { vitals: { pulse: 84, spo2: 95 } }, { effectiveAt: T(12), source: { author: 'RN Arun' } }),
    ...projectObservations(VITALS_V2, { vitals: { pulse: 88 }, notes: 'ok' }, { effectiveAt: T(14) }),
  ];
  const sheet = buildFlowsheet(VITALS_V2, history);

  it('has one column per occurrence, newest first, with authors', () => {
    expect(sheet.columns).toEqual([
      { effectiveAt: T(14), authors: [] },
      { effectiveAt: T(12), authors: ['RN Arun'] },
      { effectiveAt: T(10), authors: ['RN Priya'] },
    ]);
  });

  it('groups rows by section in UI order and drops fields with no readings', () => {
    expect(sheet.sections.map((s) => [s.label, s.rows.map((r) => r.key)])).toEqual([
      ['Vitals', ['vitals.pulse', 'vitals.spo2', 'vitals.avpu']],
      [undefined, ['notes']],
    ]);
  });

  it('fills cells aligned to columns, with the option label for a coded answer', () => {
    const pulse = sheet.sections[0].rows[0];
    expect(pulse.cells.map((c) => c.text)).toEqual(['88', '84', '90']);
    expect(pulse.unit).toBe('/min');
    expect(pulse.mixedUnits).toBe(false);
    const avpu = sheet.sections[0].rows[2];
    expect(avpu.cells.map((c) => c.text)).toEqual(['', '', 'Alert']);
  });

  it('caps columns to the newest N', () => {
    const capped = buildFlowsheet(VITALS_V2, history, { maxColumns: 2 });
    expect(capped.columns.map((c) => c.effectiveAt)).toEqual([T(14), T(12)]);
    expect(capped.sections[0].rows[0].cells.map((c) => c.text)).toEqual(['88', '84']);
  });

  it('can keep empty rows for a blank chart', () => {
    const full = buildFlowsheet(VITALS_V2, history, { includeEmptyRows: true });
    expect(full.sections[0].rows.map((r) => r.key)).toContain('vitals.onOxygen');
  });

  it('shows units per cell when a row mixes units, and separates superseded readings', () => {
    const mixed = [
      ...projectObservations(VITALS_V2, { vitals: { temp: 37.0 } }, { effectiveAt: T(8) }),
      ...projectObservations(VITALS_V3, { vitals: { temp: 98.6 } }, { effectiveAt: T(10) }),
      ...projectObservations(VITALS_V3, { vitals: { temp: 99.1 } }, { effectiveAt: T(10), source: { superseded: true } }),
    ];
    const row = buildFlowsheet(VITALS_V3, mixed).sections.flatMap((s) => s.rows).find((r) => r.key === 'vitals.temp')!;
    expect(row.mixedUnits).toBe(true);
    expect(row.cells.map((c) => c.text)).toEqual(['98.6 °F', '37 °C']);
    expect(row.cells[0].superseded.map((o) => o.value)).toEqual([99.1]);
  });

  it('renders a single recordTable response as the same grid shape', () => {
    const chart = projectObservations(
      ICU_CHART,
      { hourly: [{ observedAt: T(6), hr: 110, position: 'PRONE' }, { observedAt: T(7), hr: 104 }] },
      { effectiveAt: T(20) },
    );
    const sheet2 = buildFlowsheet(ICU_CHART, chart);
    expect(sheet2.columns.map((c) => c.effectiveAt)).toEqual([T(7), T(6)]);
    expect(sheet2.sections[0].rows.map((r) => [r.key, r.cells.map((c) => c.text)])).toEqual([
      ['hourly.observedAt', [T(7), T(6)]],
      ['hourly.hr', ['104', '110']],
      ['hourly.position', ['', 'Prone']],
    ]);
  });
});
