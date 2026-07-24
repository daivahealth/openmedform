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
});
