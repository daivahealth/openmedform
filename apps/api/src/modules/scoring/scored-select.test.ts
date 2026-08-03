import { describe, expect, it } from 'vitest';

import { JsonFormsAssemblerService } from '../form-conversion/jsonforms-assembler.service';
import { ScoringService, type ScoringRules } from './scoring.service';

/**
 * The server recomputes the authoritative score on submission — client totals
 * are never trusted. These two halves must agree with form-core's live total,
 * so the assertions mirror packages/form-core/src/scoring/scored-select.test.ts:
 * the Morse Fall Scale, answered as the source form was, totals 90 → High risk.
 */

const MORSE_UI = {
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
        options: { omf: { optionPoints: { NO: 0, YES: 15 } } },
      },
      {
        type: 'Control',
        scope: '#/properties/morse/properties/ambulatoryAid',
        options: {
          omf: {
            optionPoints: {
              NONE_BEDREST_NURSE_ASSIST: 0,
              CRUTCHES_CANE_WALKER: 15,
              FURNITURE: 30,
            },
          },
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
          omf: {
            optionPoints: { ORIENTED_TO_OWN_ABILITY: 0, OVERESTIMATES_FORGETS_LIMITATIONS: 15 },
          },
        },
      },
      {
        type: 'Control',
        scope: '#/properties/totalScore',
        options: {
          omf: {
            control: 'scoreSummary',
            bands: [
              { maxScore: 24, label: 'Low risk' },
              { minScore: 25, maxScore: 45, label: 'Moderate risk' },
              { minScore: 46, label: 'High risk' },
            ],
          },
        },
      },
    ],
  },
};

const ANSWERED_AS_SOURCE = {
  morse: {
    historyOfFalling: 'YES',
    secondaryDiagnosis: 'YES',
    ambulatoryAid: 'CRUTCHES_CANE_WALKER',
    ivTherapy: 'YES',
    gait: 'NORMAL_BEDREST_WHEELCHAIR',
    mentalStatus: 'OVERESTIMATES_FORGETS_LIMITATIONS',
  },
};

describe('deriveScoringRules for scored selects', () => {
  const assembler = new JsonFormsAssemblerService();

  it('emits optionPoints per select, not a bare points number', () => {
    const rules = assembler.deriveScoringRules(MORSE_UI) as {
      totalScore: { items: Array<{ field: string; points?: number; optionPoints?: unknown }> };
    };

    expect(rules.totalScore.items).toHaveLength(6);
    expect(rules.totalScore.items[0]).toEqual({
      field: 'morse.historyOfFalling',
      optionPoints: { NO: 0, YES: 25 },
    });
    expect(rules.totalScore.items.every((i) => i.points === undefined)).toBe(true);
  });

  it('still carries the risk bands through as thresholds', () => {
    const rules = assembler.deriveScoringRules(MORSE_UI) as {
      riskLevel: { type: string; scoreField: string; thresholds: Array<{ max: number; label: string }> };
    };

    expect(rules.riskLevel.type).toBe('threshold');
    expect(rules.riskLevel.scoreField).toBe('totalScore');
    expect(rules.riskLevel.thresholds.map((t) => t.label)).toEqual([
      'Low risk',
      'Moderate risk',
      'High risk',
    ]);
  });

  it('ignores a non-numeric or malformed optionPoints map', () => {
    const rules = assembler.deriveScoringRules({
      layout: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/a', options: { omf: { optionPoints: { YES: '25' } } } },
          { type: 'Control', scope: '#/properties/b', options: { omf: { optionPoints: [1, 2] } } },
          { type: 'Control', scope: '#/properties/c', options: { omf: { points: 3 } } },
        ],
      },
    }) as { totalScore: { items: Array<{ field: string }> } };

    // Only the well-formed tick-row survives — a string "25" would otherwise
    // make the stored total NaN.
    expect(rules.totalScore.items).toEqual([{ field: 'c', points: 3 }]);
  });

  it('prefers optionPoints when a generator emits both', () => {
    const rules = assembler.deriveScoringRules({
      layout: {
        type: 'VerticalLayout',
        elements: [
          {
            type: 'Control',
            scope: '#/properties/a',
            options: { omf: { points: 99, optionPoints: { YES: 5 } } },
          },
        ],
      },
    }) as { totalScore: { items: Array<Record<string, unknown>> } };

    expect(rules.totalScore.items).toEqual([{ field: 'a', optionPoints: { YES: 5 } }]);
  });
});

describe('ScoringService with option-priced items', () => {
  const scoring = new ScoringService();

  it('recomputes the same 90 / High risk the renderer showed', () => {
    const assembler = new JsonFormsAssemblerService();
    const rules = assembler.deriveScoringRules(MORSE_UI) as unknown as ScoringRules;

    const result = scoring.calculate(rules, ANSWERED_AS_SOURCE);

    expect(result.scores.totalScore).toBe(90);
    expect(result.riskLevel).toBe('High risk');
  });

  it('scores an unanswered form as 0', () => {
    const rules: ScoringRules = {
      totalScore: { type: 'sum', items: [{ field: 'a', optionPoints: { YES: 25 } }] },
    };

    expect(scoring.calculate(rules, {}).scores.totalScore).toBe(0);
  });

  it('scores nothing for a code the map does not price', () => {
    // A response saved against an older version of the form, or the `YES_25`
    // codes the broken generator produced.
    const rules: ScoringRules = {
      totalScore: { type: 'sum', items: [{ field: 'a', optionPoints: { YES: 25 } }] },
    };

    expect(scoring.calculate(rules, { a: 'YES_25' }).scores.totalScore).toBe(0);
  });

  it('keeps summing legacy boolean items with no optionPoints', () => {
    const rules: ScoringRules = {
      totalScore: {
        type: 'sum',
        items: [
          { field: 'ticked', points: 3 },
          { field: 'unticked', points: 7 },
          { field: 'chosen', optionPoints: { HIGH: 10 } },
        ],
      },
    };

    expect(
      scoring.calculate(rules, { ticked: true, unticked: false, chosen: 'HIGH' }).scores.totalScore,
    ).toBe(13);
  });
});
