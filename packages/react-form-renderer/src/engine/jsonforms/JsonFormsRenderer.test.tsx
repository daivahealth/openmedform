import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup } from '@testing-library/react';
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
});
