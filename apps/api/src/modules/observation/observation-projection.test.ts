import { describe, expect, it } from 'vitest';

// The API's copy and form-core's original, run over the same inputs. The
// relative import reaches form-core's SOURCE so the test needs no workspace
// dependency (the CommonJS backend cannot consume the package at runtime — see
// observation-projection.ts). `.test.ts` files are excluded from the Nest build.
import {
  projectObservations as coreProject,
  historyKeyForPath as coreKey,
} from '../../../../../packages/form-core/src/observation/project';
import { historyKeyForPath as coreKeyForPath } from '../../../../../packages/form-core/src/observation/align';
import {
  ICU_CHART,
  VITALS_V2,
  VITALS_V3,
} from '../../../../../packages/form-core/src/observation/fixtures.test-helpers';
import {
  vitalsHistoryEntries,
  vitalsHistoryReference,
  vitalsHistoryV2,
} from '../../../../../packages/form-core/src/fixtures/vitals-history.fixture';

import { historyKeyForPath, projectObservations, resolveDefinitionEffectiveAt } from './observation-projection';

void coreKey;

const AT = '2026-09-15T14:00:00Z';

const cases: Array<[string, unknown, Record<string, unknown>]> = [
  [
    'vitals v2, every value kind',
    VITALS_V2,
    {
      vitals: { pulse: 88, systolic: 138, temp: 37.2, spo2: 97, avpu: 'ALERT', symptoms: ['SOB', 'PAIN'], onOxygen: false },
      notes: 'Comfortable',
    },
  ],
  ['vitals v3, sparse', VITALS_V3, { obs: { heartRate: 90 }, vitals: { temp: '', spo2: null } }],
  [
    'recordTable with per-record time and a detail layout',
    ICU_CHART,
    {
      hourly: [
        { observedAt: '2026-09-15T08:00:00Z', hr: 92, position: 'SUPINE' },
        { observedAt: '2026-09-15T09:00:00Z', hr: 85 },
        { observedAt: 'not a date', hr: 80 },
      ],
    },
  ],
  ['demo fixture v3', vitalsHistoryReference, vitalsHistoryEntries(new Date(AT))[2].data],
  ['demo fixture v2', vitalsHistoryV2, vitalsHistoryEntries(new Date(AT))[0].data],
  ['empty response', VITALS_V2, {}],
];

describe('API projection matches form-core exactly', () => {
  it.each(cases)('%s', (_name, definition, data) => {
    const ctx = { effectiveAt: AT, source: { formCode: 'X', author: 'RN A' } };
    const ours = projectObservations(definition as never, data, ctx);
    const theirs = coreProject(definition as never, data, ctx);
    expect(ours).toEqual(theirs);
  });

  it('agrees on the alignment key', () => {
    for (const p of ['vitals.pulse', 'hourly.2.hr', 'a.0.b.1.c', '0', '']) {
      expect(historyKeyForPath(p)).toBe(coreKeyForPath(p));
    }
  });
});

describe('resolveDefinitionEffectiveAt', () => {
  const def = {
    dataSchema: {
      type: 'object',
      properties: { obs: { type: 'object', properties: { takenAt: { type: 'string', format: 'date-time' }, hr: { type: 'number' } } } },
    },
    uiSchema: {
      layout: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/obs/properties/hr' },
          { type: 'Control', scope: '#/properties/obs/properties/takenAt', options: { omf: { effectiveAt: true } } },
        ],
      },
    },
  };

  it('reads the flagged date field when it parses', () => {
    expect(resolveDefinitionEffectiveAt(def, { obs: { takenAt: '2026-09-15T13:40:00Z', hr: 90 } })).toBe(
      '2026-09-15T13:40:00Z',
    );
  });

  it('is undefined when the field is unanswered, unparseable, or not flagged', () => {
    expect(resolveDefinitionEffectiveAt(def, { obs: { hr: 90 } })).toBeUndefined();
    expect(resolveDefinitionEffectiveAt(def, { obs: { takenAt: 'yesterday' } })).toBeUndefined();
    expect(resolveDefinitionEffectiveAt(VITALS_V2 as never, { vitals: { pulse: 1 } })).toBeUndefined();
  });
});
