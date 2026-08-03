import { describe, expect, it } from 'vitest';

import type { UiSchema } from '@openmedform/form-schema-types';
import { collectScoreItems, computeScore, scoreUiSchema } from './score';

/**
 * The Morse Fall Scale as it appears in the Day Care Assessment (Nursing) form:
 * six single-selects, each option carrying its own points, summed to a total
 * that maps to Low (<25) / Moderate (25–45) / High (>45) risk.
 *
 * This is the case that produced a permanent total of 0 — the points had
 * nowhere to live, so the generator encoded them in the enum codes (`YES_25`)
 * where nothing read them.
 */
const MORSE_BANDS = [
  { maxScore: 24, label: 'Low risk' },
  { minScore: 25, maxScore: 45, label: 'Moderate risk' },
  { minScore: 46, label: 'High risk' },
];

const MORSE: UiSchema = {
  layout: {
    type: 'Group',
    label: 'Morse Fall Score',
    elements: [
      {
        type: 'Control',
        scope: '#/properties/morse/properties/historyOfFalling',
        options: { omf: { control: 'radio', optionPoints: { NO: 0, YES: 25 } } },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/secondaryDiagnosis',
        options: { omf: { control: 'radio', optionPoints: { NO: 0, YES: 15 } } },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/ambulatoryAid',
        options: {
          omf: { optionPoints: { NONE_BEDREST_NURSE_ASSIST: 0, CRUTCHES_CANE_WALKER: 15, FURNITURE: 30 } },
        },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/ivTherapy',
        options: { omf: { optionPoints: { NO: 0, YES: 20 } } },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/gait',
        options: {
          omf: { optionPoints: { NORMAL_BEDREST_WHEELCHAIR: 0, WEAK: 10, IMPAIRED: 20 } },
        },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/mentalStatus',
        options: {
          omf: { optionPoints: { ORIENTED_TO_OWN_ABILITY: 0, OVERESTIMATES_FORGETS_LIMITATIONS: 15 } },
        },
      },
    ],
  },
} as unknown as UiSchema;

describe('scored single-select', () => {
  it('collects an optionPoints control as a scored item', () => {
    const items = collectScoreItems(MORSE);

    expect(items).toHaveLength(6);
    expect(items[0]).toMatchObject({
      path: 'morse.historyOfFalling',
      points: 0,
      optionPoints: { NO: 0, YES: 25 },
      section: 'Morse Fall Score',
    });
  });

  it('scores the exact selection from the source form: 90, High risk', () => {
    // Yes / Yes / Crutches / Yes / Normal / Overestimates
    // 25 + 15 + 15 + 20 + 0 + 15 = 90
    const result = scoreUiSchema(
      MORSE,
      {
        morse: {
          historyOfFalling: 'YES',
          secondaryDiagnosis: 'YES',
          ambulatoryAid: 'CRUTCHES_CANE_WALKER',
          ivTherapy: 'YES',
          gait: 'NORMAL_BEDREST_WHEELCHAIR',
          mentalStatus: 'OVERESTIMATES_FORGETS_LIMITATIONS',
        },
      },
      MORSE_BANDS,
    );

    expect(result.total).toBe(90);
    expect(result.riskLabel).toBe('High risk');
    expect(result.bySection).toEqual({ 'Morse Fall Score': 90 });
  });

  it('totals 0 with nothing answered, and stays 0 when every answer is a zero option', () => {
    expect(scoreUiSchema(MORSE, {}, MORSE_BANDS)).toMatchObject({
      total: 0,
      riskLabel: 'Low risk',
    });

    const allNo = scoreUiSchema(
      MORSE,
      {
        morse: {
          historyOfFalling: 'NO',
          secondaryDiagnosis: 'NO',
          ambulatoryAid: 'NONE_BEDREST_NURSE_ASSIST',
          ivTherapy: 'NO',
          gait: 'NORMAL_BEDREST_WHEELCHAIR',
          mentalStatus: 'ORIENTED_TO_OWN_ABILITY',
        },
      },
      MORSE_BANDS,
    );
    expect(allNo.total).toBe(0);
    expect(allNo.riskLabel).toBe('Low risk');
  });

  it('crosses each band boundary at the right score', () => {
    const at = (historyOfFalling: string, gait: string) =>
      scoreUiSchema(MORSE, { morse: { historyOfFalling, gait } }, MORSE_BANDS);

    expect(at('NO', 'WEAK')).toMatchObject({ total: 10, riskLabel: 'Low risk' });
    expect(at('YES', 'NORMAL_BEDREST_WHEELCHAIR')).toMatchObject({
      total: 25,
      riskLabel: 'Moderate risk',
    });
    expect(at('YES', 'IMPAIRED')).toMatchObject({ total: 45, riskLabel: 'Moderate risk' });
  });

  it('ignores a selection whose code is not in the map', () => {
    // A stale response saved against an older version of the form, or the
    // `YES_25` codes the broken generator produced. Scoring what it cannot
    // price would invent a number.
    const result = scoreUiSchema(MORSE, { morse: { historyOfFalling: 'YES_25' } }, MORSE_BANDS);

    expect(result.total).toBe(0);
    expect(result.bySection).toEqual({});
  });

  it('still scores boolean tick-rows, and mixes them with selects', () => {
    const mixed = {
      layout: {
        type: 'Group',
        label: 'Mixed',
        elements: [
          { type: 'Control', scope: '#/properties/acuteMI', options: { omf: { points: 1 } } },
          {
            type: 'Control',
            scope: '#/properties/aid',
            options: { omf: { optionPoints: { NONE: 0, FURNITURE: 30 } } },
          },
        ],
      },
    } as unknown as UiSchema;

    expect(computeScore(collectScoreItems(mixed), { acuteMI: true, aid: 'FURNITURE' })).toMatchObject({
      total: 31,
      bySection: { Mixed: 31 },
    });
  });
});
