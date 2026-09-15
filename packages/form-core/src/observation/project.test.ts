import { describe, expect, it } from 'vitest';

import { projectObservations } from './project';
import { ICU_CHART, LOINC_HR, LOINC_SYS, SNOMED_ALERT, VITALS_V2 } from './fixtures.test-helpers';

const AT = '2026-09-15T14:00:00Z';

describe('projectObservations', () => {
  const data = {
    vitals: {
      pulse: 88,
      systolic: 138,
      temp: 37.2,
      spo2: 97,
      avpu: 'ALERT',
      symptoms: ['SOB', 'PAIN'],
      onOxygen: false,
    },
    notes: 'Comfortable',
  };
  const rows = projectObservations(VITALS_V2, data, { effectiveAt: AT, source: { formCode: 'VITALS', version: '2' } });
  const byPath = (path: string) => rows.filter((r) => r.path === path);

  it('emits one row per scalar with the field coding, unit, label and section', () => {
    expect(byPath('vitals.pulse')).toEqual([
      {
        path: 'vitals.pulse',
        label: 'Pulse',
        section: 'Vitals',
        coding: [LOINC_HR],
        unit: '/min',
        value: 88,
        effectiveAt: AT,
        source: { formCode: 'VITALS', version: '2' },
      },
    ]);
    expect(byPath('vitals.systolic')[0]).toMatchObject({ coding: [LOINC_SYS], unit: 'mm[Hg]', value: 138 });
  });

  it('keeps an unbound field — path-only history is fragile, not absent', () => {
    const [spo2] = byPath('vitals.spo2');
    expect(spo2).toMatchObject({ label: 'SpO2', unit: '%', value: 97 });
    expect(spo2.coding).toBeUndefined();
  });

  it('stores the code of a single-select and attaches the option label and binding', () => {
    expect(byPath('vitals.avpu')).toEqual([
      {
        path: 'vitals.avpu',
        label: 'AVPU',
        section: 'Vitals',
        value: 'ALERT',
        valueLabel: 'Alert',
        valueCoding: [SNOMED_ALERT],
        effectiveAt: AT,
        source: { formCode: 'VITALS', version: '2' },
      },
    ]);
  });

  it('splits a multi-select into one row per selected option', () => {
    expect(byPath('vitals.symptoms').map((r) => [r.value, r.valueLabel])).toEqual([
      ['SOB', 'Short of breath'],
      ['PAIN', 'Pain'],
    ]);
  });

  it('keeps false booleans and top-level text, in UI-schema order', () => {
    expect(byPath('vitals.onOxygen')[0].value).toBe(false);
    expect(rows[rows.length - 1]).toMatchObject({ path: 'notes', value: 'Comfortable', label: 'Notes' });
    expect(rows[rows.length - 1].section).toBeUndefined();
  });

  it('emits nothing for unanswered fields or an empty response', () => {
    const sparse = projectObservations(VITALS_V2, { vitals: { pulse: null, temp: '', spo2: undefined } }, { effectiveAt: AT });
    expect(sparse).toEqual([]);
    expect(projectObservations(VITALS_V2, undefined, { effectiveAt: AT })).toEqual([]);
  });

  it('omits `source` when none was given', () => {
    const [row] = projectObservations(VITALS_V2, { vitals: { pulse: 70 } }, { effectiveAt: AT });
    expect('source' in row).toBe(false);
  });
});

describe('projectObservations — repeating groups', () => {
  const data = {
    hourly: [
      { observedAt: '2026-09-15T08:00:00Z', hr: 92, position: 'SUPINE' },
      { observedAt: '2026-09-15T09:00:00Z', hr: 85 },
      { observedAt: 'not a date', hr: 80 },
    ],
  };
  const rows = projectObservations(ICU_CHART, data, { effectiveAt: '2026-09-15T20:00:00Z' });

  it('walks the detail layout for every record, with the index in the path', () => {
    expect(rows.filter((r) => r.path.endsWith('.hr')).map((r) => [r.path, r.value])).toEqual([
      ['hourly.0.hr', 92],
      ['hourly.1.hr', 85],
      ['hourly.2.hr', 80],
    ]);
    const first = rows.find((r) => r.path === 'hourly.0.hr')!;
    expect(first).toMatchObject({ coding: [LOINC_HR], unit: '/min' });
    expect(first.section).toBeUndefined();
  });

  it("takes each record's own time from effectiveAtPath, falling back to the response time", () => {
    const times = rows.filter((r) => r.path.endsWith('.hr')).map((r) => r.effectiveAt);
    expect(times).toEqual(['2026-09-15T08:00:00Z', '2026-09-15T09:00:00Z', '2026-09-15T20:00:00Z']);
  });

  it('resolves enum labels inside a record from optionLabels', () => {
    expect(rows.find((r) => r.path === 'hourly.0.position')).toMatchObject({ value: 'SUPINE', valueLabel: 'Supine' });
  });

  it('projects a record with no detail layout from its items schema so nothing is dropped', () => {
    const bare = {
      dataSchema: ICU_CHART.dataSchema,
      uiSchema: { layout: { type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/hourly' }] } },
    } as typeof ICU_CHART;
    const out = projectObservations(bare, data, { effectiveAt: '2026-09-15T20:00:00Z' });
    expect(out.map((r) => r.path)).toContain('hourly.1.hr');
    // Without effectiveAtPath every row takes the response time.
    expect(new Set(out.map((r) => r.effectiveAt))).toEqual(new Set(['2026-09-15T20:00:00Z']));
  });
});
