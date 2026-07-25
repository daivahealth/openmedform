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
