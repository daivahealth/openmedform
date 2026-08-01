/**
 * recordTable — the repeating encounter log.
 *
 * Modelled on the real source that motivated the control: the Chemotherapy
 * Monitoring sheet, whose markup ships a `<thead>` of nine columns, an empty
 * `<tbody>` and an "+ Add treatment day" button, with every row's ~100 fields
 * built by script behind a tab strip.
 */

import { afterEach, describe, it, expect } from 'vitest';
import { render, screen, cleanup, fireEvent } from '@testing-library/react';
import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from '../JsonFormsRenderer';

afterEach(cleanup);

const treatmentLog: JsonFormsFormDefinition = {
  id: 'chemo',
  formCode: 'CHEMO-MON',
  name: 'Chemotherapy Monitoring',
  version: 1,
  language: 'en',
  status: 'DRAFT',
  engine: 'jsonforms',
  dataSchema: {
    type: 'object',
    properties: {
      treatmentDays: {
        type: 'array',
        items: {
          type: 'object',
          properties: {
            date: { type: 'string', title: 'Date' },
            nurse: { type: 'string', title: 'Nurse' },
            timelog: {
              type: 'object',
              properties: {
                cycle: { type: 'string', title: 'Cycle' },
                dayNum: { type: 'string', title: 'Day #' },
              },
            },
            adverseEvents: { type: 'array', items: { type: 'string' } },
          },
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
          type: 'Control',
          scope: '#/properties/treatmentDays',
          options: {
            omf: {
              control: 'recordTable',
              recordTable: {
                addLabel: '+ Add treatment day',
                countLabel: '{n} treatment day{s} logged this month',
                emptyLabel: 'No treatment days logged for this month yet.',
                columns: [
                  { label: 'Date', path: 'date' },
                  { label: 'Cycle / Day#', path: 'timelog.cycle', pairWith: 'timelog.dayNum' },
                  { label: 'Adverse events', countOf: 'adverseEvents', align: 'center' },
                  { label: 'Nurse', path: 'nurse' },
                ],
              },
            },
            detail: {
              type: 'OmfTabsLayout',
              elements: [
                {
                  type: 'Group',
                  label: 'Patient & Order Details',
                  elements: [{ type: 'Control', scope: '#/properties/date' }],
                },
                {
                  type: 'Group',
                  label: 'Time / Cycle Log',
                  elements: [{ type: 'Control', scope: '#/properties/timelog/properties/cycle' }],
                },
              ],
            },
          },
        },
      ],
    },
  },
  printSchema: { schemaVersion: '1.0', page: { size: 'A4', orientation: 'portrait' } },
} as unknown as JsonFormsFormDefinition;

describe('recordTable', () => {
  it('renders the source column headers, the count line and the add button', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);

    expect(screen.getByText('Date')).toBeTruthy();
    expect(screen.getByText('Cycle / Day#')).toBeTruthy();
    expect(screen.getByText('Nurse')).toBeTruthy();
    expect(screen.getByText('0 treatment days logged this month')).toBeTruthy();
    expect(screen.getByRole('button', { name: '+ Add treatment day' })).toBeTruthy();
  });

  it('shows the empty-state row instead of a generic list widget', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    expect(screen.getByText('No treatment days logged for this month yet.')).toBeTruthy();
    // The stock JSON Forms array UI would emit these; the custom control must win.
    expect(screen.queryByText('No data')).toBeNull();
    expect(screen.queryByText(/Add to/)).toBeNull();
  });

  it('adds a row and opens its detail panel with a Close button', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);

    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));

    expect(screen.getByText('1 treatment day logged this month')).toBeTruthy();
    // The new row opens straight away, as in the source form.
    expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Patient & Order Details' })).toBeTruthy();
    expect(screen.getByRole('tab', { name: 'Time / Cycle Log' })).toBeTruthy();
  });

  it('collapses the detail panel when Close is clicked', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));

    expect(screen.queryByRole('tab', { name: 'Patient & Order Details' })).toBeNull();
    expect(screen.getByRole('button', { name: 'Open' })).toBeTruthy();
    // The row itself survives — only the panel closed.
    expect(screen.getByText('1 treatment day logged this month')).toBeTruthy();
  });

  it('switches detail tabs without losing the row', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));
    fireEvent.click(screen.getByRole('tab', { name: 'Time / Cycle Log' }));

    expect(screen.getByRole('tab', { name: 'Time / Cycle Log' }).getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(screen.getByText('1 treatment day logged this month')).toBeTruthy();
  });

  it('writes an edited detail field back into the record and into the summary row', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));

    const dateInput = document.querySelector('input') as HTMLInputElement;
    fireEvent.change(dateInput, { target: { value: '2026-08-01' } });

    // Asserted through the summary cell rather than the renderer's onChange
    // prop: under jsdom, `fireEvent.change` does not make @jsonforms/react emit
    // onChange at all (reproducible against a bare <JsonForms> too), so an
    // onChange assertion here would test the harness, not the control. The
    // summary cell is the stronger check anyway — it proves the edit reached
    // treatmentDays[0].date AND that the row re-read it.
    const summaryCells = Array.from(document.querySelectorAll('tbody td')).map((c) => c.textContent);
    expect(summaryCells).toContain('2026-08-01');
  });

  it('renders a nested-array column as a count and an empty value as an em dash', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));

    // adverseEvents is seeded to [] by createDefault, so the count column is 0…
    const cells = Array.from(document.querySelectorAll('tbody td')).map((c) => c.textContent);
    expect(cells).toContain('0');
    // …and unfilled string columns print an em dash rather than "undefined".
    expect(cells).toContain('—');
    // The paired column prints both halves.
    expect(cells).toContain('— / —');
  });

  it('removes a record and drops its detail panel', () => {
    render(<JsonFormsRenderer definition={treatmentLog} />);
    fireEvent.click(screen.getByRole('button', { name: '+ Add treatment day' }));
    fireEvent.click(screen.getByRole('button', { name: /Remove record 1/ }));

    expect(screen.getByText('0 treatment days logged this month')).toBeTruthy();
    expect(screen.queryByRole('button', { name: 'Close' })).toBeNull();
  });

  describe('unconfigured arrays (the safety net)', () => {
    // An array of objects with NO omf config at all — what a model emits when
    // it half-recognises a repeating group. This used to fall through to the
    // stock JSON Forms list widget, which is what produced the
    // "Day & Date / Add to Day & Date / Valid / No data" block on the VIP form.
    const bare = {
      ...treatmentLog,
      dataSchema: {
        type: 'object',
        properties: {
          days: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                dayDate: { type: 'string', title: 'Day & Date' },
                shift: { type: 'string', title: 'Time (M/E/N)' },
                nested: { type: 'object', properties: { x: { type: 'string' } } },
              },
            },
          },
        },
      },
      uiSchema: {
        schemaVersion: '1.0',
        layout: {
          type: 'VerticalLayout',
          elements: [{ type: 'Control', scope: '#/properties/days' }],
        },
      },
    } as unknown as JsonFormsFormDefinition;

    it('never renders the stock list widget', () => {
      render(<JsonFormsRenderer definition={bare} />);
      expect(screen.queryByText('No data')).toBeNull();
      expect(screen.queryByText(/^Add to/)).toBeNull();
      expect(screen.queryByText('Valid')).toBeNull();
    });

    it('derives summary columns from the item schema instead', () => {
      render(<JsonFormsRenderer definition={bare} />);
      expect(screen.getByText('Day & Date')).toBeTruthy();
      expect(screen.getByText('Time (M/E/N)')).toBeTruthy();
      // A nested object is not a summary cell — it belongs in the detail panel.
      expect(screen.queryByText('Nested')).toBeNull();
    });

    it('still supports adding a record', () => {
      render(<JsonFormsRenderer definition={bare} />);
      const add = screen.getByRole('button', { name: /^\+ Add/ });
      fireEvent.click(add);
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    });
  });

  describe('column orientation (paper-mirroring)', () => {
    // The VIP cannula chart shape: parameters down the left, one column per
    // cannula. Same data as row mode — only the axes swap.
    const cannulaChart = {
      ...treatmentLog,
      dataSchema: {
        type: 'object',
        properties: {
          cannulas: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                insDate: { type: 'string', title: 'Date of Insertion' },
                site: { type: 'string', title: 'Site' },
                gauge: { type: 'string', title: 'Size of Cannula (Gauge)' },
              },
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
              type: 'Control',
              scope: '#/properties/cannulas',
              options: {
                omf: {
                  control: 'recordTable',
                  recordTable: {
                    orientation: 'columns',
                    addLabel: '+ Add Cannula',
                    emptyLabel: 'No cannulas recorded.',
                    columns: [
                      { label: 'Date of Insertion', path: 'insDate' },
                      { label: 'Site', path: 'site' },
                      { label: 'Size of Cannula (Gauge)', path: 'gauge' },
                    ],
                  },
                },
                detail: {
                  type: 'VerticalLayout',
                  elements: [{ type: 'Control', scope: '#/properties/site' }],
                },
              },
            },
          ],
        },
      },
    } as unknown as JsonFormsFormDefinition;

    it('puts the field labels down the left, not across the top', () => {
      render(<JsonFormsRenderer definition={cannulaChart} />);
      fireEvent.click(screen.getByRole('button', { name: '+ Add Cannula' }));

      // The parameter spine lives in the first cell of each body row.
      const firstCells = Array.from(document.querySelectorAll('tbody tr')).map(
        (tr) => tr.querySelector('td')?.textContent,
      );
      expect(firstCells).toContain('Date of Insertion');
      expect(firstCells).toContain('Site');
      expect(firstCells).toContain('Size of Cannula (Gauge)');
      // …and the header row carries record instances, not field names.
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
      expect(headers).toEqual(['Parameter', 'Record 1']);
    });

    it('adds a column per record rather than a row', () => {
      render(<JsonFormsRenderer definition={cannulaChart} />);
      const add = screen.getByRole('button', { name: '+ Add Cannula' });
      fireEvent.click(add);
      fireEvent.click(add);
      fireEvent.click(add);

      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
      expect(headers).toEqual(['Parameter', 'Record 1', 'Record 2', 'Record 3']);

      // Adding auto-opens the new record, so close it for a clean row count.
      fireEvent.click(screen.getByRole('button', { name: 'Close' }));
      // Body rows stay at one per FIELD (3) plus the actions row — records grew
      // sideways, not downward.
      expect(document.querySelectorAll('tbody tr').length).toBe(4);
    });

    it('still opens a detail panel spanning the full width', () => {
      render(<JsonFormsRenderer definition={cannulaChart} />);
      // Adding auto-opens the record, mirroring the source form's behaviour.
      fireEvent.click(screen.getByRole('button', { name: '+ Add Cannula' }));

      const detail = document.querySelector('.omf-record-detail');
      expect(detail).toBeTruthy();
      expect(detail?.getAttribute('colspan')).toBe('2');
      expect(screen.getByRole('button', { name: 'Close' })).toBeTruthy();
    });

    it('shows the empty label before any record exists', () => {
      render(<JsonFormsRenderer definition={cannulaChart} />);
      expect(screen.getByText('No cannulas recorded.')).toBeTruthy();
    });

    it('defaults to row orientation when not specified', () => {
      render(<JsonFormsRenderer definition={treatmentLog} />);
      const headers = Array.from(document.querySelectorAll('thead th')).map((th) => th.textContent);
      // treatmentLog declares no orientation, so fields stay across the top.
      expect(headers).toContain('Date');
      expect(headers).not.toContain('Parameter');
    });
  });
});
