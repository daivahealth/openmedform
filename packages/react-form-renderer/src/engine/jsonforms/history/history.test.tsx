import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import type { HistoryEntry, JsonFormsFormDefinition, Observation } from '@openmedform/form-schema-types';
import { JsonFormsRenderer } from '../JsonFormsRenderer';

afterEach(cleanup);

const LOINC_HR = { system: 'http://loinc.org', code: '8867-4', display: 'Heart rate', source: 'human' as const, verified: true };

const base = {
  id: 'vitals',
  formCode: 'VITALS',
  name: 'Vitals',
  version: '3',
  language: 'en',
  status: 'PUBLISHED',
  audit: {},
  printSchema: {},
  translations: {},
  assets: [],
} as unknown as JsonFormsFormDefinition;

/** v3: heart rate at obs.heartRate with a chip; SpO2 unbound with no chip; AVPU select with a popover-only chip. */
const V3: JsonFormsFormDefinition = {
  ...base,
  dataSchema: {
    type: 'object',
    properties: {
      obs: { type: 'object', properties: { heartRate: { type: 'number', title: 'Heart rate' } } },
      vitals: {
        type: 'object',
        properties: {
          spo2: { type: 'number', title: 'SpO2' },
          avpu: { type: 'string', title: 'AVPU', oneOf: [{ const: 'ALERT', title: 'Alert' }, { const: 'VERBAL', title: 'Verbal' }] },
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
          scope: '#/properties/obs/properties/heartRate',
          options: { omf: { coding: [LOINC_HR], unit: '/min', history: { show: 'inline', count: 3 } } },
        },
        { type: 'Control', scope: '#/properties/vitals/properties/spo2', options: { omf: { unit: '%' } } },
        {
          type: 'Control',
          scope: '#/properties/vitals/properties/avpu',
          options: { omf: { history: { show: 'popover' } } },
        },
      ],
    },
  } as JsonFormsFormDefinition['uiSchema'],
};

/** v2: heart rate lived at vitals.pulse. */
const V2 = {
  dataSchema: {
    type: 'object',
    properties: {
      vitals: {
        type: 'object',
        properties: {
          pulse: { type: 'number', title: 'Pulse' },
          spo2: { type: 'number' },
          avpu: { type: 'string', oneOf: [{ const: 'ALERT', title: 'Alert' }, { const: 'VERBAL', title: 'Verbal' }] },
        },
      },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/vitals/properties/pulse', options: { omf: { coding: [LOINC_HR], unit: '/min' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/spo2' },
        { type: 'Control', scope: '#/properties/vitals/properties/avpu' },
      ],
    },
  },
} as unknown as JsonFormsFormDefinition;

const NOW = new Date('2026-09-15T14:00:00Z');

describe('history — previous-value chip', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  const history: HistoryEntry[] = [
    { effectiveAt: '2026-09-15T10:00:00Z', data: { vitals: { pulse: 90, spo2: 96, avpu: 'VERBAL' } }, definition: V2, author: 'RN Priya' },
    { effectiveAt: '2026-09-15T12:00:00Z', data: { vitals: { pulse: 84, spo2: 95 } }, definition: V2, author: 'RN Arun' },
    { effectiveAt: '2026-09-15T08:00:00Z', data: { vitals: { avpu: 'ALERT' } } },
  ];

  it('renders nothing extra when the host supplies no history', () => {
    render(<JsonFormsRenderer definition={V3} />);
    expect(document.querySelector('.omf-history')).toBeNull();
  });

  it('shows the latest prior value with age and delta under a history-enabled field, aligned across a rename', () => {
    render(<JsonFormsRenderer definition={V3} data={{ obs: { heartRate: 90 } }} history={history} />);
    const chip = screen.getByRole('button', { name: /Previous 84 \/min · 2h ago/ });
    expect(chip.textContent).toContain('↑ +6');
  });

  it('does not decorate a field without omf.history even when it has history', () => {
    render(<JsonFormsRenderer definition={V3} history={history} />);
    // Only two chips: heart rate (inline) and AVPU (popover). SpO2 has none.
    expect(document.querySelectorAll('.omf-history-chip')).toHaveLength(2);
  });

  it('opens a popover listing the last N with clock, author and a sparkline', () => {
    render(<JsonFormsRenderer definition={V3} history={history} />);
    fireEvent.click(screen.getByRole('button', { name: /Previous 84/ }));
    const region = screen.getByRole('region', { name: 'Previous values for Heart rate' });
    expect(region.textContent).toContain('RN Arun');
    expect(region.textContent).toContain('RN Priya');
    expect(region.textContent).toContain('84 /min');
    expect(region.querySelector('svg.omf-history-sparkline')).not.toBeNull();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('region')).toBeNull();
  });

  it('popover mode shows a count instead of the value and reads the option label', () => {
    render(<JsonFormsRenderer definition={V3} history={history} />);
    fireEvent.click(screen.getByRole('button', { name: 'History (2)' }));
    const region = screen.getByRole('region', { name: 'Previous values for AVPU' });
    expect(region.textContent).toContain('Verbal');
    expect(region.textContent).toContain('Alert');
    expect(region.querySelector('svg')).toBeNull();
  });
});

describe('history — lazy provider', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  it('asks the provider per history-enabled field with coding, index-free path and limit, and shows the result', async () => {
    const provider = vi.fn(async (q: { path: string }): Promise<Observation[]> =>
      q.path === 'obs.heartRate'
        ? [{ path: 'hr', label: 'HR', value: 101, unit: '/min', coding: [LOINC_HR], effectiveAt: '2026-09-15T13:30:00Z' }]
        : [],
    );
    render(<JsonFormsRenderer definition={V3} historyProvider={provider} />);
    await waitFor(() => expect(screen.getByRole('button', { name: /Previous 101 \/min · 30m ago/ })).toBeTruthy());
    expect(provider).toHaveBeenCalledTimes(2);
    expect(provider).toHaveBeenCalledWith({ coding: [LOINC_HR], path: 'obs.heartRate', limit: 3 });
    expect(provider).toHaveBeenCalledWith({ path: 'vitals.avpu', limit: 5 });
  });

  it('provider results win over batch history at the same time, and a failure never blocks the field', async () => {
    const failing = vi.fn(async () => {
      throw new Error('offline');
    });
    render(<JsonFormsRenderer definition={V3} historyProvider={failing} />);
    await waitFor(() => expect(screen.getAllByText('Previous values unavailable').length).toBeGreaterThan(0));
    expect(document.querySelectorAll('input').length).toBeGreaterThan(0);
  });
});

describe('history — section-level omf.history (ADR-006)', () => {
  beforeEach(() => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(NOW);
  });
  afterEach(() => vi.useRealTimers());

  /** history declared ONCE on the Group; spo2 opts out; avpu narrows to popover. */
  const SECTION: JsonFormsFormDefinition = {
    ...V3,
    uiSchema: {
      schemaVersion: '1.0',
      layout: {
        type: 'Group',
        label: 'Observations',
        options: { omf: { history: { show: 'inline', count: 3 } } },
        elements: [
          { type: 'Control', scope: '#/properties/obs/properties/heartRate', options: { omf: { coding: [LOINC_HR], unit: '/min' } } },
          { type: 'Control', scope: '#/properties/vitals/properties/spo2', options: { omf: { unit: '%', history: { show: 'none' } } } },
          { type: 'Control', scope: '#/properties/vitals/properties/avpu', options: { omf: { history: { show: 'popover' } } } },
        ],
      },
    } as JsonFormsFormDefinition['uiSchema'],
  };
  const history: HistoryEntry[] = [
    { effectiveAt: '2026-09-15T12:00:00Z', data: { vitals: { pulse: 84, spo2: 95, avpu: 'ALERT' } }, definition: V2 },
  ];

  it('a field with no omf.history of its own inherits the Group setting', () => {
    render(<JsonFormsRenderer definition={SECTION} history={history} />);
    expect(screen.getByRole('button', { name: /Previous 84 \/min · 2h ago/ })).toBeTruthy();
  });

  it("a field's own setting overrides: opt-out shows nothing, popover narrows the mode", () => {
    render(<JsonFormsRenderer definition={SECTION} history={history} />);
    expect(document.querySelectorAll('.omf-history-chip')).toHaveLength(2);
    expect(screen.getByRole('button', { name: 'History (1)' })).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Previous 95/ })).toBeNull();
  });

  it('the inherited count reaches the provider query', async () => {
    const provider = vi.fn(async (): Promise<Observation[]> => []);
    render(<JsonFormsRenderer definition={SECTION} historyProvider={provider} />);
    await waitFor(() => expect(provider).toHaveBeenCalled());
    expect(provider).toHaveBeenCalledWith({ coding: [LOINC_HR], path: 'obs.heartRate', limit: 3 });
  });
});
