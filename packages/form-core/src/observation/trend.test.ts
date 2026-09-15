import { describe, expect, it } from 'vitest';

import type { Observation } from '@openmedform/form-schema-types';
import { hasMixedUnits, latestDelta, trendPoints } from './trend';

const obs = (value: Observation['value'], hour: number, unit?: string): Observation => ({
  path: 'vitals.hr',
  label: 'HR',
  value,
  effectiveAt: `2026-09-15T${String(hour).padStart(2, '0')}:00:00Z`,
  ...(unit ? { unit } : {}),
});

describe('trendPoints', () => {
  it('returns numeric points ascending in time, skipping non-numeric rows', () => {
    const pts = trendPoints([obs(88, 12), obs('n/a', 11), obs('92', 10), obs(true, 9)]);
    expect(pts.map((p) => p.v)).toEqual([92, 88]);
    expect(pts[0].t).toBeLessThan(pts[1].t);
  });
});

describe('latestDelta', () => {
  it('reports direction and signed delta against the previous reading', () => {
    expect(latestDelta(obs(84, 14), obs(90, 12))).toEqual({ direction: 'down', delta: -6, unitMismatch: false });
    expect(latestDelta(96, obs(90, 12))).toMatchObject({ direction: 'up', delta: 6 });
    expect(latestDelta(obs(90, 14), obs(90, 12))!.direction).toBe('same');
  });

  it('is undefined with no prior or a non-numeric side', () => {
    expect(latestDelta(obs(90, 14), undefined)).toBeUndefined();
    expect(latestDelta(obs('ALERT', 14), obs('VERBAL', 12))).toBeUndefined();
  });

  it('flags a unit mismatch instead of converting', () => {
    const d = latestDelta(obs(98.6, 14, '[degF]'), obs(37.0, 12, 'Cel'))!;
    expect(d.unitMismatch).toBe(true);
    expect(d.delta).toBeCloseTo(61.6);
  });
});

describe('hasMixedUnits', () => {
  it('is true only when more than one distinct unit is present', () => {
    expect(hasMixedUnits([obs(1, 1, 'Cel'), obs(2, 2, 'Cel')])).toBe(false);
    expect(hasMixedUnits([obs(1, 1, 'Cel'), obs(2, 2)])).toBe(true);
    expect(hasMixedUnits([obs(1, 1, 'Cel'), obs(2, 2, '[degF]')])).toBe(true);
  });
});
