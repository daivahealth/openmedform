import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { rrtSbarReference } from '@openmedform/form-core';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './JsonFormsRenderer';

afterEach(cleanup);

/**
 * The Morse Fall Scale from a real Day Care Assessment (Nursing) form.
 *
 * Both bugs this guards against were visible on one screen: every option read
 * as its raw code (`YES_25`, `CRUTCHES_CANE_WALKER_15`) because the points had
 * been smuggled into the codes, and the total sat at 0 no matter what was
 * selected because nothing scored them.
 */
function morseDefinition(): JsonFormsFormDefinition {
  const select = (title: string, options: Array<[string, string]>) => ({
    title,
    oneOf: options.map(([const_, optTitle]) => ({ const: const_, title: optTitle })),
  });

  return {
    ...rrtSbarReference,
    dataSchema: {
      type: 'object',
      properties: {
        historyOfFalling: select('History of falling', [
          ['NO', 'No'],
          ['YES', 'Yes'],
        ]),
        ambulatoryAid: select('Ambulatory aid', [
          ['NONE_BEDREST_NURSE_ASSIST', 'None/bedrest/nurse assist'],
          ['CRUTCHES_CANE_WALKER', 'Crutches/Cane/Walker'],
          ['FURNITURE', 'Furniture'],
        ]),
        totalScore: { type: 'number', title: 'Total score' },
      },
    },
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'Group',
        label: 'Morse Fall Score',
        elements: [
          {
            type: 'Control',
            scope: '#/properties/historyOfFalling',
            options: { omf: { control: 'radio', optionPoints: { NO: 0, YES: 25 } } },
          },
          {
            type: 'Control',
            scope: '#/properties/ambulatoryAid',
            options: {
              omf: {
                control: 'radio',
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
            scope: '#/properties/totalScore',
            label: 'Total score',
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
    },
  } as unknown as JsonFormsFormDefinition;
}

describe('scored single-select', () => {
  it('shows the source labels, never the stored codes', () => {
    render(<JsonFormsRenderer definition={morseDefinition()} />);

    expect(screen.getByText('Crutches/Cane/Walker')).toBeTruthy();
    expect(screen.getByText('None/bedrest/nurse assist')).toBeTruthy();
    expect(screen.getByText('Yes')).toBeTruthy();

    // The codes themselves must not be on screen anywhere.
    expect(screen.queryByText('CRUTCHES_CANE_WALKER')).toBeNull();
    expect(screen.queryByText(/_\d+$/)).toBeNull();
  });

  it('stores the code, not the label, when an option is picked', () => {
    render(<JsonFormsRenderer definition={morseDefinition()} />);

    const yes = screen.getByText('Yes').closest('label')?.querySelector('input');
    expect(yes?.getAttribute('value')).toBe('YES');
  });

  it('moves the live total as options are selected', () => {
    const { container } = render(<JsonFormsRenderer definition={morseDefinition()} />);
    const totalText = () => container.textContent ?? '';

    expect(totalText()).toContain('Low risk');

    const pick = (label: string) => {
      const input = screen.getByText(label).closest('label')?.querySelector('input');
      fireEvent.click(input as Element);
    };

    pick('Yes'); // 25
    expect(totalText()).toContain('25');
    expect(totalText()).toContain('Moderate risk');

    pick('Crutches/Cane/Walker'); // +15 = 40
    expect(totalText()).toContain('40');
    expect(totalText()).toContain('Moderate risk');

    pick('Furniture'); // replaces 15 with 30 = 55
    expect(totalText()).toContain('55');
    expect(totalText()).toContain('High risk');
  });
});

describe('a oneOf enum with an explicit string type', () => {
  /**
   * What the generator actually emits: `type: "string"` alongside the `oneOf`.
   * Both are true of the same schema, so the string-input tester and the
   * select tester matched at the same rank — and the input, registered first,
   * won. The field rendered as an empty text box with no options at all.
   */
  const typedOneOf = (): JsonFormsFormDefinition =>
    ({
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          gait: {
            type: 'string',
            title: 'Gait',
            oneOf: [
              { const: 'NORMAL_BEDREST_WHEELCHAIR', title: 'Normal/bedrest/wheelchair' },
              { const: 'WEAK', title: 'Weak' },
              { const: 'IMPAIRED', title: 'Impaired' },
            ],
          },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Control',
              scope: '#/properties/gait',
              options: { omf: { optionPoints: { NORMAL_BEDREST_WHEELCHAIR: 0, WEAK: 10, IMPAIRED: 20 } } },
            },
          ],
        },
      },
    }) as unknown as JsonFormsFormDefinition;

  it('renders a select with its options, not a bare text input', () => {
    const { container } = render(<JsonFormsRenderer definition={typedOneOf()} />);

    const select = container.querySelector('select');
    expect(select).toBeTruthy();
    expect(container.querySelector('input[type="text"]')).toBeNull();

    const optionText = Array.from(select?.querySelectorAll('option') ?? []).map((o) => o.textContent);
    expect(optionText).toContain('Normal/bedrest/wheelchair');
    expect(optionText).toContain('Impaired');
  });
});

describe('omf.hideSectionTotal', () => {
  /**
   * The Σ chip is renderer-drawn, so "remove the Σ 0 from that box" was
   * impossible to express in the definition — the AI silently no-opped on it.
   * The flag makes it a normal schema edit. Scoring must be untouched: only
   * the badge goes.
   */
  const scoredGroup = (omf: Record<string, unknown>): JsonFormsFormDefinition =>
    ({
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: { historyOfFalling: { type: 'string', enum: ['NO', 'YES'] } },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Group',
          label: 'Morse Fall Score',
          options: { omf },
          elements: [
            {
              type: 'Control',
              scope: '#/properties/historyOfFalling',
              options: { omf: { optionPoints: { NO: 0, YES: 25 } } },
            },
          ],
        },
      },
    }) as unknown as JsonFormsFormDefinition;

  it('shows the subtotal chip by default on a scored section', () => {
    render(<JsonFormsRenderer definition={scoredGroup({})} />);
    expect(screen.getByTitle('Section subtotal')).toBeTruthy();
  });

  it('hides the chip when the section opts out — without touching the fields', () => {
    const { container } = render(
      <JsonFormsRenderer definition={scoredGroup({ hideSectionTotal: true })} />,
    );

    expect(screen.queryByTitle('Section subtotal')).toBeNull();
    // The scored control itself is still there and still scored.
    expect(container.querySelectorAll('select, input[type="radio"]').length).toBeGreaterThan(0);
  });
});

describe('where the automatic Σ chip is drawn', () => {
  /**
   * The Sepsis screening sheet: qSOFA and SIRS each total on the paper; the
   * boxes AROUND them do not. Summing every scored descendant put a "Σ 0" on
   * the outer section and on the whole screening tool as well — a total the
   * source never printed, and one a clinician could read as a score.
   */
  const nested = (outerOmf: Record<string, unknown> = {}): JsonFormsFormDefinition =>
    ({
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: { hypotension: { type: 'boolean' }, tachypnoea: { type: 'boolean' } },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Group',
          label: 'Scoring Systems',
          options: { omf: outerOmf },
          elements: [
            {
              type: 'Group',
              label: 'qSOFA',
              elements: [
                { type: 'Control', scope: '#/properties/hypotension', options: { omf: { points: 1 } } },
                { type: 'Control', scope: '#/properties/tachypnoea', options: { omf: { points: 1 } } },
              ],
            },
          ],
        },
      },
    }) as unknown as JsonFormsFormDefinition;

  it('draws one chip — on the scoring section, not on the box around it', () => {
    render(<JsonFormsRenderer definition={nested()} />);
    expect(screen.getAllByTitle('Section subtotal')).toHaveLength(1);
  });

  it('draws the outer chip too when the definition asks for it', () => {
    render(<JsonFormsRenderer definition={nested({ showSectionTotal: true })} />);
    expect(screen.getAllByTitle('Section subtotal')).toHaveLength(2);
  });
});
