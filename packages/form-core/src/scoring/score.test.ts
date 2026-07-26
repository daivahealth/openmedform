import { describe, it, expect } from 'vitest';
import { collectScoreItems, computeScore, scoreUiSchema, stratify } from './score';
import type { UiSchema } from '@openmedform/form-schema-types';

const ui: UiSchema = {
  schemaVersion: '1.0',
  layout: {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Group',
        label: 'AGE',
        elements: [
          { type: 'Control', scope: '#/properties/age/properties/age41to60', options: { omf: { points: 1 } } },
          { type: 'Control', scope: '#/properties/age/properties/age75plus', options: { omf: { points: 3 } } },
        ],
      },
      {
        type: 'Group',
        label: 'CARDIOVASCULAR',
        elements: [
          { type: 'Control', scope: '#/properties/cardiovascular/properties/acuteMI', options: { omf: { points: 1 } } },
        ],
      },
      // An unscored control is ignored.
      { type: 'Control', scope: '#/properties/notes' },
    ],
  },
} as UiSchema;

const bands = [
  { maxScore: 1, label: 'Low' },
  { minScore: 2, maxScore: 4, label: 'Moderate' },
  { minScore: 5, label: 'High' },
];

describe('form-core scoring', () => {
  it('collects only scored controls, tagged with their section', () => {
    const items = collectScoreItems(ui);
    expect(items).toHaveLength(3);
    expect(items[0]).toMatchObject({ path: 'age.age41to60', points: 1, section: 'AGE' });
    expect(items[2]).toMatchObject({ path: 'cardiovascular.acuteMI', section: 'CARDIOVASCULAR' });
  });

  it('sums ticked points into a total + per-section subtotals', () => {
    const data = { age: { age75plus: true }, cardiovascular: { acuteMI: true } };
    const r = computeScore(collectScoreItems(ui), data);
    expect(r.total).toBe(4);
    expect(r.bySection).toEqual({ AGE: 3, CARDIOVASCULAR: 1 });
  });

  it('ignores unticked / missing values', () => {
    expect(computeScore(collectScoreItems(ui), {}).total).toBe(0);
    expect(computeScore(collectScoreItems(ui), { age: { age41to60: false } }).total).toBe(0);
  });

  it('stratifies the total into the matching band', () => {
    expect(stratify(0, bands)?.label).toBe('Low');
    expect(stratify(3, bands)?.label).toBe('Moderate');
    expect(stratify(9, bands)?.label).toBe('High');
    expect(stratify(3, undefined)).toBeUndefined();
  });

  it('scoreUiSchema resolves risk label from bands in one call', () => {
    const data = { age: { age75plus: true }, cardiovascular: { acuteMI: true } };
    const r = scoreUiSchema(ui, data, bands);
    expect(r.total).toBe(4);
    expect(r.riskLabel).toBe('Moderate');
  });
});
