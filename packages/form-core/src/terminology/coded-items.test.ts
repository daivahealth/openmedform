import { describe, expect, it } from 'vitest';

import type { UiSchema } from '@openmedform/form-schema-types';
import { collectCodedItems } from './coded-items';

const DATA_SCHEMA = {
  type: 'object',
  properties: {
    vitals: {
      type: 'object',
      properties: {
        spo2: { type: 'number', title: 'SpO2 (%)' },
        avpu: {
          type: 'string',
          title: 'AVPU',
          oneOf: [
            { const: 'ALERT', title: 'Alert' },
            { const: 'VERBAL', title: 'Verbal' },
          ],
        },
      },
    },
    notes: { type: 'string' },
  },
};

const LOINC_SPO2 = {
  system: 'http://loinc.org',
  code: '59408-5',
  display: 'Oxygen saturation in Arterial blood by Pulse oximetry',
  source: 'ai' as const,
  confidence: 0.93,
  verified: false,
};

const UI_SCHEMA: UiSchema = {
  layout: {
    type: 'Group',
    label: 'Vitals',
    elements: [
      {
        type: 'Control',
        scope: '#/properties/vitals/properties/spo2',
        options: { omf: { coding: [LOINC_SPO2] } },
      },
      {
        type: 'Control',
        scope: '#/properties/vitals/properties/avpu',
        options: {
          omf: {
            optionCoding: {
              ALERT: [
                {
                  system: 'http://snomed.info/sct',
                  code: '248234008',
                  source: 'human',
                  verified: true,
                },
              ],
            },
          },
        },
      },
      { type: 'Control', scope: '#/properties/notes' },
    ],
  },
} as unknown as UiSchema;

describe('collectCodedItems', () => {
  const rows = collectCodedItems(UI_SCHEMA, DATA_SCHEMA);

  it('lists every Control — unmapped fields are the to-do state, not noise', () => {
    expect(rows.map((r) => r.path)).toEqual(['vitals.spo2', 'vitals.avpu', 'notes']);
    expect(rows[2].coding).toEqual([]);
  });

  it('resolves labels the way the renderer does, with the section attached', () => {
    expect(rows[0]).toMatchObject({ label: 'SpO2 (%)', section: 'Vitals' });
    // No title anywhere -> the key is the honest fallback.
    expect(rows[2].label).toBe('notes');
  });

  it('carries field bindings through untouched', () => {
    expect(rows[0].coding).toEqual([LOINC_SPO2]);
  });

  it('expands enum controls into per-option rows with their own bindings', () => {
    const avpu = rows[1];
    expect(avpu.options?.map((o) => `${o.code}:${o.label}`)).toEqual([
      'ALERT:Alert',
      'VERBAL:Verbal',
    ]);
    expect(avpu.options?.[0].coding[0]).toMatchObject({ code: '248234008', verified: true });
    expect(avpu.options?.[1].coding).toEqual([]);
    // Non-enum fields get no options list at all.
    expect(rows[0].options).toBeUndefined();
  });
});
