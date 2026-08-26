import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import { rrtSbarReference } from '@openmedform/form-core';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from './JsonFormsRenderer';

afterEach(cleanup);

describe('JsonFormsRenderer — reference RRT/SBAR form', () => {
  it('renders the separated Data/UI schema as live fields', () => {
    render(<JsonFormsRenderer definition={rrtSbarReference} />);

    // omf textarea control (situation narrative) is rendered as a <textarea>.
    const textareas = document.querySelectorAll('textarea');
    expect(textareas.length).toBeGreaterThan(0);

    // omf radio control (AVPU) renders each enum value as a radio option.
    expect(screen.getByText('ALERT')).toBeTruthy();
    const radios = document.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBeGreaterThanOrEqual(4);

    // reason-for-call booleans render as checkboxes.
    const checkboxes = document.querySelectorAll('input[type="checkbox"]');
    expect(checkboxes.length).toBeGreaterThan(0);
  });

  it('renders a clinical scoringMatrix control from options.omf config', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: { vte: { type: 'object', additionalProperties: { type: 'boolean' } } },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Control',
              scope: '#/properties/vte',
              label: 'VTE Risk',
              options: {
                omf: {
                  control: 'scoringMatrix',
                  domains: [
                    { name: 'Mobility', items: [{ field: 'bedrest', label: 'Bed rest', points: 1 }] },
                  ],
                },
              },
            },
          ],
        },
      },
    };

    render(<JsonFormsRenderer definition={def} />);
    expect(screen.getByText('Bed rest')).toBeTruthy();
    expect(screen.getByText('Risk Factor')).toBeTruthy();
  });

  it('renders a colour-coded, icon-headed domain box with scored checkbox rows', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          age: {
            type: 'object',
            additionalProperties: false,
            properties: {
              age41to60: { type: 'boolean', title: 'Age 41–60 years' },
              age75plus: { type: 'boolean', title: 'Age ≥75 years' },
            },
          },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Group',
              label: 'AGE',
              options: { omf: { accentColor: '#5b53c6', icon: '🎂', pointLegend: [1, 3] } },
              elements: [
                { type: 'Control', scope: '#/properties/age/properties/age41to60', options: { omf: { points: 1 } } },
                { type: 'Control', scope: '#/properties/age/properties/age75plus', options: { omf: { points: 3 } } },
              ],
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // The section header shows its emoji icon and label.
    expect(screen.getByText('🎂')).toBeTruthy();
    expect(screen.getByText('AGE')).toBeTruthy();

    // Both risk-factor rows render as checkboxes with their source labels.
    expect(document.querySelectorAll('input[type="checkbox"]').length).toBe(2);
    expect(screen.getByText('Age ≥75 years')).toBeTruthy();

    // Point badges: legend chips [1,3] in the header + one per row = "1" x2, "3" x2.
    const ones = screen.getAllByText('1');
    const threes = screen.getAllByText('3');
    expect(ones.length).toBeGreaterThanOrEqual(2);
    expect(threes.length).toBeGreaterThanOrEqual(2);
  });

  it('does not double the section icon when the label already embeds it', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          cv: {
            type: 'object',
            additionalProperties: false,
            properties: { acuteMI: { type: 'boolean', title: 'Acute MI' } },
          },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Group',
          label: '❤️ CARDIOVASCULAR',
          options: { omf: { accentColor: '#c0392b', icon: '❤️' } },
          elements: [
            { type: 'Control', scope: '#/properties/cv/properties/acuteMI', options: { omf: { points: 1 } } },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);
    // Exactly one heart glyph across the whole rendered header.
    const hearts = (document.body.textContent?.match(/❤️/g) ?? []).length;
    expect(hearts).toBe(1);
  });

  it('lays a two-option YES/NO radio out label-left, options-right', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: { chf: { type: 'string', title: 'Congestive Heart Failure', enum: ['YES', 'NO'] } },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Control',
          scope: '#/properties/chf',
          // No explicit labelPosition — a two-option radio defaults to label-left.
          options: { omf: { control: 'radio' } },
        },
      },
    };

    render(<JsonFormsRenderer definition={def} />);
    const label = screen.getByText('Congestive Heart Failure');
    const radios = document.querySelectorAll('input[type="radio"]');
    expect(radios.length).toBe(2);
    // Label and the first radio share a horizontal flex row (label on the left).
    const row = label.parentElement!;
    expect(getComputedStyle(row).display).toBe('flex');
    expect(row.contains(radios[0])).toBe(true);
  });

  it('renders a subsection Group as an indented heading + nested items (no box)', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          accp: {
            type: 'object',
            additionalProperties: false,
            properties: {
              chf: { type: 'string', title: 'Congestive Heart Failure', enum: ['YES', 'NO'] },
              stroke: { type: 'string', title: 'Acute ischaemic stroke', enum: ['YES', 'NO'] },
            },
          },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Group',
          label: 'ACCP CHECK',
          elements: [
            { type: 'Control', scope: '#/properties/accp/properties/chf', options: { omf: { control: 'radio' } } },
            {
              type: 'Group',
              label: 'Immobility PLUS one or more of:',
              options: { omf: { variant: 'subsection' } },
              elements: [
                { type: 'Control', scope: '#/properties/accp/properties/stroke', options: { omf: { control: 'radio' } } },
              ],
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);
    const heading = screen.getByText('Immobility PLUS one or more of:');
    // The heading itself carries no radio; only its nested factor does.
    expect(heading.querySelector('input[type="radio"]')).toBeNull();
    // The nested factor renders beneath the heading, inside an indented body
    // (left border rule) that is a sibling of the heading — not a new box.
    const body = heading.nextElementSibling as HTMLElement | null;
    expect(body?.style.borderLeft).toContain('2px');
    expect(body?.querySelectorAll('input[type="radio"]').length).toBe(2);
    expect(screen.getByText('Acute ischaemic stroke')).toBeTruthy();
    // chf (2) + nested stroke (2) = 4 radios total.
    expect(document.querySelectorAll('input[type="radio"]').length).toBe(4);
  });

  it('renders an OmfTableLayout as a bordered table with left label cells', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          allergyNotes: { type: 'string', title: 'Φάρμακα' },
          respirations: { type: 'number', title: 'Αναπνοές' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'OmfTableLayout',
          elements: [
            {
              type: 'OmfTableRow',
              label: 'Αλλεργίες',
              elements: [{ type: 'Control', scope: '#/properties/allergyNotes' }],
            },
            {
              type: 'OmfTableRow',
              label: 'Ζωτικά Σημεία',
              elements: [{ type: 'Control', scope: '#/properties/respirations' }],
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // A real <table> is emitted, with a row per OmfTableRow.
    expect(document.querySelectorAll('table').length).toBe(1);
    expect(document.querySelectorAll('tbody > tr').length).toBe(2);

    // The left category labels render as the first cell of each row.
    expect(screen.getByText('Αλλεργίες')).toBeTruthy();
    expect(screen.getByText('Ζωτικά Σημεία')).toBeTruthy();

    // The row's field controls render in the right cell.
    expect(document.querySelectorAll('input, textarea, select').length).toBeGreaterThanOrEqual(2);
  });

  it('reveals an OmfTableRow only when its own rule is satisfied', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          feature1: { type: 'string', title: 'Feature 1', enum: ['PRESENT', 'ABSENT'] },
          feature2: { type: 'string', title: 'Feature 2', enum: ['PRESENT', 'ABSENT'] },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'OmfTableLayout',
          elements: [
            {
              type: 'OmfTableRow',
              label: 'Feature 1: Acute Onset',
              elements: [{ type: 'Control', scope: '#/properties/feature1' }],
            },
            {
              type: 'OmfTableRow',
              label: 'Feature 2: Inattention',
              elements: [{ type: 'Control', scope: '#/properties/feature2' }],
              rule: {
                effect: 'SHOW',
                condition: {
                  scope: '#/properties/feature1',
                  schema: { const: 'PRESENT' },
                },
              },
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // Progressive disclosure: only the gating row is on the page to start with.
    expect(document.querySelectorAll('tbody > tr').length).toBe(1);
    expect(screen.queryByText('Feature 2: Inattention')).toBeNull();

    const select = document.querySelector('select') as HTMLSelectElement;
    fireEvent.change(select, { target: { value: 'PRESENT' } });

    expect(document.querySelectorAll('tbody > tr').length).toBe(2);
    expect(screen.getByText('Feature 2: Inattention')).toBeTruthy();

    // …and it goes away again when the gate closes.
    fireEvent.change(select, { target: { value: 'ABSENT' } });
    expect(document.querySelectorAll('tbody > tr').length).toBe(1);
  });

  it('shows a computed-outcome Label only when its multi-field rule matches', () => {
    // The CAM-ICU result banner. Its text lived only in the source page's
    // script, so the outcome is rebuilt as one Label per case, each gated by a
    // root-scope ("#") condition combining several answers.
    const outcome = (text: string, schema: object) => ({
      type: 'Label',
      text,
      rule: { effect: 'SHOW', condition: { scope: '#', schema } },
    });
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          feature1: { type: 'string', title: 'Feature 1', enum: ['PRESENT', 'ABSENT'] },
          feature2: { type: 'string', title: 'Feature 2', enum: ['PRESENT', 'ABSENT'] },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            { type: 'Control', scope: '#/properties/feature1' },
            { type: 'Control', scope: '#/properties/feature2' },
            outcome('CAM-ICU POSITIVE (Delirium Present)', {
              type: 'object',
              properties: { feature1: { const: 'PRESENT' }, feature2: { const: 'PRESENT' } },
              required: ['feature1', 'feature2'],
            }),
            outcome('CAM-ICU NEGATIVE (No Delirium)', {
              type: 'object',
              required: ['feature1'],
              anyOf: [
                { properties: { feature1: { const: 'ABSENT' } }, required: ['feature1'] },
                { properties: { feature2: { const: 'ABSENT' } }, required: ['feature2'] },
              ],
            }),
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // Unanswered: neither outcome claims a result.
    expect(screen.queryByText(/CAM-ICU POSITIVE/)).toBeNull();
    expect(screen.queryByText(/CAM-ICU NEGATIVE/)).toBeNull();

    const [f1, f2] = Array.from(document.querySelectorAll('select')) as HTMLSelectElement[];
    fireEvent.change(f1, { target: { value: 'PRESENT' } });
    // One conjunct satisfied is not an outcome.
    expect(screen.queryByText(/CAM-ICU POSITIVE/)).toBeNull();

    fireEvent.change(f2, { target: { value: 'PRESENT' } });
    expect(screen.getByText(/CAM-ICU POSITIVE/)).toBeTruthy();
    expect(screen.queryByText(/CAM-ICU NEGATIVE/)).toBeNull();

    // …and the outcomes stay mutually exclusive as answers change.
    fireEvent.change(f2, { target: { value: 'ABSENT' } });
    expect(screen.getByText(/CAM-ICU NEGATIVE/)).toBeTruthy();
    expect(screen.queryByText(/CAM-ICU POSITIVE/)).toBeNull();
  });

  it('shows a per-section verdict beside the subtotal from omf.bands', () => {
    // The Sepsis sheet: qSOFA is positive at >= 2 of 3, and the verdict rides on
    // THIS section's subtotal — a form-level scoreSummary would add qSOFA and
    // SIRS together into a number that means nothing.
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: {
          hypotension: { type: 'boolean', title: 'Hypotension (SBP <= 100 mmHg)' },
          ams: { type: 'boolean', title: 'Altered mental status (GCS < 15)' },
          tachypnoea: { type: 'boolean', title: 'Tachypnoea (RR >= 22/min)' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'Group',
          label: 'qSOFA (1 pt each)',
          options: {
            omf: {
              bands: [
                { maxScore: 1, label: 'Negative', color: '#2e7d4f' },
                { minScore: 2, label: 'Positive', color: '#b3392c' },
              ],
            },
          },
          elements: [
            { type: 'Control', scope: '#/properties/hypotension', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/ams', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/tachypnoea', options: { omf: { points: 1 } } },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // Nothing ticked: the section reads 0 and the low band.
    expect(screen.getByText('Σ 0')).toBeTruthy();
    expect(screen.getByText('Negative')).toBeTruthy();

    const boxes = Array.from(
      document.querySelectorAll('input[type="checkbox"]'),
    ) as HTMLInputElement[];
    fireEvent.click(boxes[0]);
    expect(screen.getByText('Σ 1')).toBeTruthy();
    expect(screen.getByText('Negative')).toBeTruthy();

    // Crossing the threshold flips the verdict, live.
    fireEvent.click(boxes[1]);
    expect(screen.getByText('Σ 2')).toBeTruthy();
    expect(screen.getByText('Positive')).toBeTruthy();
    expect(screen.queryByText('Negative')).toBeNull();
  });

  it('preserves line breaks in a multi-line bulleted Label', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: { type: 'object', properties: {} },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Label',
              text: '- Να πάρει ελαφρύ πρωινό (τσάι – φρυγανιά)\n- Να έχει τις εξετάσεις\n- Να μην χρησιμοποιεί μακιγιάζ',
            } as never,
          ],
        },
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    const el = screen.getByText(/Να πάρει ελαφρύ πρωινό/);
    // Each dash line survives as its own line (not collapsed into a run-on),
    // and the block preserves newlines via white-space: pre-line.
    expect(el.textContent).toContain('\n- Να έχει τις εξετάσεις');
    expect(el.textContent).toContain('\n- Να μην χρησιμοποιεί μακιγιάζ');
    expect(getComputedStyle(el).whiteSpace).toBe('pre-line');
  });

  it('renders a column table as a real grid: header row, one cell per column, no in-cell labels', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doctorName: { type: 'string', title: 'Doctor — Name' },
          doctorDate: { type: 'string', format: 'date', title: 'Doctor — Date' },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'OmfTableLayout',
          options: { omf: { columns: [{ label: 'Role' }, { label: 'Name' }, { label: 'Date' }] } },
          elements: [
            {
              type: 'OmfTableRow',
              label: 'Doctor',
              elements: [
                { type: 'Control', scope: '#/properties/doctorName' },
                { type: 'Control', scope: '#/properties/doctorDate' },
              ],
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    // A real header row, in source order.
    expect([...document.querySelectorAll('thead th')].map((th) => th.textContent)).toEqual([
      'Role',
      'Name',
      'Date',
    ]);
    // Row label occupies column 1; each control gets its OWN cell (3 = columns).
    const cells = document.querySelectorAll('tbody tr td');
    expect(cells.length).toBe(3);
    expect(cells[0].textContent).toBe('Doctor');
    // The header names the field, so cells must not repeat the label.
    expect(document.querySelectorAll('tbody td label').length).toBe(0);
    expect(document.querySelectorAll('tbody td input').length).toBe(2);
  });

  it('keeps the two-cell left-label layout when no columns are declared', () => {
    const def: JsonFormsFormDefinition = {
      ...rrtSbarReference,
      dataSchema: {
        type: 'object',
        properties: { notes: { type: 'string', title: 'Notes' } },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'OmfTableLayout',
          elements: [
            {
              type: 'OmfTableRow',
              label: 'Allergies',
              elements: [{ type: 'Control', scope: '#/properties/notes' }],
            },
          ],
        } as never,
      },
    };

    render(<JsonFormsRenderer definition={def} />);

    expect(document.querySelectorAll('thead th').length).toBe(0);
    expect(document.querySelectorAll('tbody tr td').length).toBe(2);
    // Existing behaviour: the field keeps its own label in this mode.
    expect(screen.getByText('Notes')).toBeTruthy();
  });
});


/**
 * Conditional visibility — the shape HTML conversion now emits for a
 * "Please specify…" box beside a select's "Other" option (issue #74).
 */
describe('JsonFormsRenderer — SHOW rules', () => {
  const conditional = (data?: Record<string, unknown>): JsonFormsFormDefinition => ({
    ...rrtSbarReference,
    dataSchema: {
      type: 'object',
      properties: {
        site: { type: 'string', title: 'Site', enum: ['FOREARM', 'OTHER'] },
        siteOther: { type: 'string', title: 'Please specify…' },
      },
    },
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'VerticalLayout',
        elements: [
          { type: 'Control', scope: '#/properties/site' },
          {
            type: 'Control',
            scope: '#/properties/siteOther',
            rule: {
              effect: 'SHOW',
              condition: { scope: '#/properties/site', schema: { const: 'OTHER' } },
            },
          },
        ],
      },
    },
    ...(data ? { data } : {}),
  });

  it('hides the conditional field until its trigger matches', () => {
    render(<JsonFormsRenderer definition={conditional()} data={{ site: 'FOREARM' }} />);

    expect(screen.queryByText('Please specify…')).toBeNull();
  });

  it('shows it once the controlling field holds the trigger value', () => {
    render(<JsonFormsRenderer definition={conditional()} data={{ site: 'OTHER' }} />);

    expect(screen.getByText('Please specify…')).toBeTruthy();
  });

  it('hides a whole Group when its rule says so', () => {
    // React honoured layout rules already; the Angular renderer did not until
    // now, so this is the parity anchor for both.
    const def: JsonFormsFormDefinition = {
      ...conditional(),
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [
            {
              type: 'Group',
              label: 'Other details',
              rule: {
                effect: 'SHOW',
                condition: { scope: '#/properties/site', schema: { const: 'OTHER' } },
              },
              elements: [{ type: 'Control', scope: '#/properties/siteOther' }],
            },
          ],
        },
      },
    };

    render(<JsonFormsRenderer definition={def} data={{ site: 'FOREARM' }} />);
    expect(screen.queryByText('Other details')).toBeNull();

    cleanup();
    render(<JsonFormsRenderer definition={def} data={{ site: 'OTHER' }} />);
    expect(screen.getByText('Other details')).toBeTruthy();
  });
});
