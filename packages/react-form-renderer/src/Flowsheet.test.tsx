import { afterEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import type { FormDefinitionSchemas, HistoryEntry } from '@openmedform/form-schema-types';
import { Flowsheet } from './Flowsheet';

afterEach(cleanup);

const LOINC_HR = { system: 'http://loinc.org', code: '8867-4', source: 'human' as const, verified: true };

const DEF = {
  dataSchema: {
    type: 'object',
    properties: {
      vitals: {
        type: 'object',
        properties: {
          pulse: { type: 'number', title: 'Pulse' },
          spo2: { type: 'number', title: 'SpO2' },
          avpu: { type: 'string', title: 'AVPU', oneOf: [{ const: 'ALERT', title: 'Alert' }] },
        },
      },
      notes: { type: 'string', title: 'Notes' },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Group',
          label: 'Vitals',
          elements: [
            { type: 'Control', scope: '#/properties/vitals/properties/pulse', options: { omf: { coding: [LOINC_HR], unit: '/min' } } },
            { type: 'Control', scope: '#/properties/vitals/properties/spo2', options: { omf: { unit: '%' } } },
            { type: 'Control', scope: '#/properties/vitals/properties/avpu' },
          ],
        },
        { type: 'Control', scope: '#/properties/notes' },
      ],
    },
  },
} as unknown as FormDefinitionSchemas;

const entries: HistoryEntry[] = [
  { effectiveAt: '2026-09-15T10:00:00Z', data: { vitals: { pulse: 90, spo2: 96, avpu: 'ALERT' } }, author: 'RN Priya' },
  { effectiveAt: '2026-09-15T12:00:00Z', data: { vitals: { pulse: 84, spo2: 95 } }, author: 'RN Arun' },
  { effectiveAt: '2026-09-15T14:00:00Z', data: { vitals: { pulse: 88 } } },
];

describe('Flowsheet', () => {
  it('renders parameters down the left and one column per occurrence, newest first', () => {
    render(<Flowsheet definition={DEF} entries={entries} timeZone="UTC" title="Vitals today" />);
    expect(screen.getByRole('heading', { name: 'Vitals today' })).toBeTruthy();
    const headers = [...document.querySelectorAll('thead th')].map((th) => th.textContent);
    expect(headers[0]).toBe('Parameter');
    expect(headers.slice(1).map((h) => h!.slice(0, 5))).toEqual(['14:00', '12:00', '10:00']);
    expect(headers[2]).toContain('RN Arun');

    const rows = [...document.querySelectorAll('tbody tr.omf-flowsheet-row')].map((tr) =>
      [...tr.querySelectorAll('th, td')].map((c) => c.textContent),
    );
    expect(rows).toEqual([
      ['Pulse/min', '88', '84', '90'],
      ['SpO2%', '', '95', '96'],
      ['AVPU', '', '', 'Alert'],
    ]);
    // Section header row from the Group label; 'Notes' has no readings and is not listed.
    expect(screen.getByText('Vitals')).toBeTruthy();
    expect(screen.queryByText('Notes')).toBeNull();
  });

  it('caps columns and strikes through superseded readings', () => {
    render(
      <Flowsheet
        definition={DEF}
        entries={entries}
        observations={[
          { path: 'vitals.pulse', label: 'Pulse', value: 80, unit: '/min', coding: [LOINC_HR], effectiveAt: '2026-09-15T14:00:00Z', source: { superseded: true } },
        ]}
        maxColumns={1}
        timeZone="UTC"
      />,
    );
    expect(document.querySelectorAll('thead th')).toHaveLength(2);
    const pulse = document.querySelector('tbody tr.omf-flowsheet-row')!;
    expect(pulse.querySelector('s')!.textContent).toBe('80');
    expect(pulse.querySelectorAll('td')[0].textContent).toBe('8088');
  });

  it('says so when there is nothing to chart', () => {
    render(<Flowsheet definition={DEF} entries={[]} emptyLabel="Nothing yet" />);
    expect(screen.getByText('Nothing yet')).toBeTruthy();
    expect(document.querySelector('table')).toBeNull();
  });
});
