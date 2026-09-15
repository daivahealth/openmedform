import { describe, expect, it } from 'vitest';

import type { Observation } from '@openmedform/form-schema-types';
import {
  alignHistory,
  alignHistoryEntries,
  collectHistoryFields,
  historyKeyForPath,
  mergeHistory,
  observationMatchesField,
} from './align';
import { projectObservations } from './project';
import { ICU_CHART, LOINC_HR, LOINC_TEMP, VITALS_V2, VITALS_V3 } from './fixtures.test-helpers';

const T = (h: number) => `2026-09-15T${String(h).padStart(2, '0')}:00:00Z`;

describe('historyKeyForPath', () => {
  it('strips array indices so a record field keys like a top-level one', () => {
    expect(historyKeyForPath('treatments.2.dose')).toBe('treatments.dose');
    expect(historyKeyForPath('vitals.pulse')).toBe('vitals.pulse');
    expect(historyKeyForPath('0')).toBe('');
  });
});

describe('collectHistoryFields', () => {
  it('lists every Control including those inside a recordTable detail, keyed without indices', () => {
    expect(collectHistoryFields(ICU_CHART).map((f) => f.key)).toEqual([
      'hourly',
      'hourly.observedAt',
      'hourly.hr',
      'hourly.position',
    ]);
    expect(collectHistoryFields(VITALS_V3).map((f) => f.key)).toEqual(['obs.heartRate', 'vitals.spo2', 'vitals.temp']);
  });
});

describe('alignHistory — the matching rule', () => {
  // Two fills against v2, now rendering v3 where heart rate moved.
  const fills = [
    { effectiveAt: T(10), data: { vitals: { pulse: 90, spo2: 96, temp: 37.1 } } },
    { effectiveAt: T(12), data: { vitals: { pulse: 84, spo2: 95, temp: 37.4 } } },
  ];
  const history = fills.flatMap((f) => projectObservations(VITALS_V2, f.data, { effectiveAt: f.effectiveAt }));
  const aligned = alignHistory(VITALS_V3, history);

  it('matches by LOINC code across a rename and a move', () => {
    expect(aligned.get('obs.heartRate')!.map((o) => [o.path, o.value])).toEqual([
      ['vitals.pulse', 84],
      ['vitals.pulse', 90],
    ]);
  });

  it('falls back to the path for an unbound field that stayed put', () => {
    expect(aligned.get('vitals.spo2')!.map((o) => o.value)).toEqual([95, 96]);
  });

  it('matches by code even when the unit changed, and carries both units for the caller to show', () => {
    const temps = aligned.get('vitals.temp')!;
    expect(temps.map((o) => o.unit)).toEqual(['Cel', 'Cel']);
    expect(collectHistoryFields(VITALS_V3).find((f) => f.key === 'vitals.temp')!.unit).toBe('[degF]');
  });

  it('orders newest first', () => {
    expect(aligned.get('obs.heartRate')!.map((o) => o.effectiveAt)).toEqual([T(12), T(10)]);
  });

  it('present-but-empty for a field with no history, absent for a non-field', () => {
    const none = alignHistory(VITALS_V3, []);
    expect(none.get('obs.heartRate')).toEqual([]);
    expect(none.has('vitals.pulse')).toBe(false);
  });

  it('never matches by label', () => {
    const field = { key: 'x.temperature', coding: undefined };
    const obs: Observation = { path: 'y.temperature', label: 'x.temperature', value: 98.6, effectiveAt: T(1) };
    expect(observationMatchesField(field, obs)).toBe(false);
  });

  it('a coding match does not also attribute the observation to an unrelated field at the same path', () => {
    // v2's `vitals.temp` is a coded temperature; a definition with an UNBOUND
    // control at `vitals.temp` bound to nothing AND a bound temp elsewhere.
    const def = {
      dataSchema: { type: 'object', properties: { vitals: { type: 'object', properties: { temp: { type: 'string' } } }, t: { type: 'number' } } },
      uiSchema: {
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/vitals/properties/temp' },
            { type: 'Control', scope: '#/properties/t', options: { omf: { coding: [LOINC_TEMP] } } },
          ],
        },
      },
    } as unknown as typeof VITALS_V2;
    const out = alignHistory(def, history);
    expect(out.get('t')!.length).toBe(2);
    expect(out.get('vitals.temp')).toEqual([]);
  });
});

describe('alignHistory — across different forms', () => {
  it('lines up the ICU chart heart rate under the ward vitals field by LOINC', () => {
    const chart = projectObservations(
      ICU_CHART,
      { hourly: [{ observedAt: T(6), hr: 110 }, { observedAt: T(7), hr: 104 }] },
      { effectiveAt: T(20) },
    );
    const aligned = alignHistory(VITALS_V2, chart);
    expect(aligned.get('vitals.pulse')!.map((o) => [o.value, o.effectiveAt])).toEqual([
      [104, T(7)],
      [110, T(6)],
    ]);
    // Each record's field is bound, so the match is by code, not by the (different) path.
    expect(aligned.get('vitals.pulse')![0].coding).toEqual([LOINC_HR]);
  });
});

describe('alignHistoryEntries', () => {
  it('projects each entry against its own definition, then aligns; author rides on source', () => {
    const aligned = alignHistoryEntries(VITALS_V3, [
      { effectiveAt: T(8), data: { vitals: { pulse: 99 } }, definition: VITALS_V2, author: 'RN Priya' },
      { effectiveAt: T(10), data: { obs: { heartRate: 91 } } },
    ]);
    expect(aligned.get('obs.heartRate')).toEqual([
      expect.objectContaining({ value: 91, effectiveAt: T(10) }),
      expect.objectContaining({ value: 99, effectiveAt: T(8), source: { author: 'RN Priya' } }),
    ]);
  });
});

describe('mergeHistory', () => {
  it('lets provider results win at the same effectiveAt and sorts newest first', () => {
    const batch: Observation[] = [
      { path: 'a', label: 'A', value: 1, effectiveAt: T(8) },
      { path: 'a', label: 'A', value: 2, effectiveAt: T(10) },
    ];
    const fetched: Observation[] = [{ path: 'a', label: 'A', value: 20, effectiveAt: T(10) }];
    expect(mergeHistory(batch, fetched).map((o) => o.value)).toEqual([20, 1]);
  });
});
