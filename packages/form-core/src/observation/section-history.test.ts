import { describe, expect, it } from 'vitest';

import type { FormDefinitionSchemas } from '@openmedform/form-schema-types';
import { collectHistoryFields, resolveHistoryConfig } from './align';
import { collectCodedItems } from '../terminology/coded-items';

/**
 * ADR-006: `omf.history` on a Group is the default for the reading-bearing
 * Controls beneath it; the nearest section wins; a field's own value
 * overrides, `show: 'none'` opting it out.
 */
const DEF = {
  dataSchema: {
    type: 'object',
    properties: {
      obs: {
        type: 'object',
        properties: {
          hr: { type: 'number', title: 'Heart rate' },
          position: { type: 'string', title: 'Position', enum: ['SUPINE', 'PRONE'] },
          note: { type: 'string', title: 'Note' },
          pain: { type: 'integer', title: 'Pain score' },
          total: { type: 'integer' },
        },
      },
      admission: { type: 'object', properties: { ward: { type: 'string', title: 'Ward' } } },
      hourly: {
        type: 'array',
        items: { type: 'object', properties: { t: { type: 'string' }, spo2: { type: 'number', title: 'SpO2' } } },
      },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Group',
          label: 'Observations',
          options: { omf: { history: { show: 'inline', count: 8 } } },
          elements: [
            { type: 'Control', scope: '#/properties/obs/properties/hr' },
            { type: 'Control', scope: '#/properties/obs/properties/position', options: { omf: { control: 'radio' } } },
            // Opted out of the section.
            { type: 'Control', scope: '#/properties/obs/properties/note', options: { omf: { control: 'textarea', history: { show: 'none' } } } },
            {
              // Nested section narrows the default.
              type: 'Group',
              label: 'Pain',
              options: { omf: { history: { show: 'popover' } } },
              elements: [{ type: 'Control', scope: '#/properties/obs/properties/pain' }],
            },
            // A display control never inherits.
            { type: 'Control', scope: '#/properties/obs/properties/total', options: { omf: { control: 'scoreSummary' } } },
            // A recordTable's fields inherit the section's default.
            { type: 'Control', scope: '#/properties/hourly', options: { omf: { control: 'recordTable' } } },
          ],
        },
        {
          type: 'Group',
          label: 'Admission',
          elements: [{ type: 'Control', scope: '#/properties/admission/properties/ward' }],
        },
      ],
    },
  },
} as unknown as FormDefinitionSchemas;

describe('section-level history (ADR-006)', () => {
  const fields = new Map(collectHistoryFields(DEF).map((f) => [f.key, f]));

  it('a reading-bearing Control inherits the nearest section, marked as inherited', () => {
    expect(fields.get('obs.hr')!.history).toEqual({ show: 'inline', count: 8 });
    expect(fields.get('obs.hr')!.historyInherited).toBe(true);
    // radio is a reading control too.
    expect(fields.get('obs.position')!.history).toEqual({ show: 'inline', count: 8 });
  });

  it("a field's own setting wins, including an explicit opt-out", () => {
    expect(fields.get('obs.note')!.history).toEqual({ show: 'none' });
    expect(fields.get('obs.note')!.historyInherited).toBe(false);
  });

  it('a nested section overrides the outer one', () => {
    expect(fields.get('obs.pain')!.history).toEqual({ show: 'popover' });
    expect(fields.get('obs.pain')!.historyInherited).toBe(true);
  });

  it('display controls never inherit; the recordTable container does not, its record fields do', () => {
    expect(fields.get('obs.total')!.history).toBeUndefined();
    expect(fields.get('hourly')!.history).toBeUndefined();
    expect(fields.get('hourly.spo2')!.history).toEqual({ show: 'inline', count: 8 });
    expect(fields.get('hourly.t')!.history).toEqual({ show: 'inline', count: 8 });
  });

  it('a section without history leaves its fields unset', () => {
    expect(fields.get('admission.ward')!.history).toBeUndefined();
    expect(fields.get('admission.ward')!.historyInherited).toBeUndefined();
  });

  it('resolveHistoryConfig keys the effective settings by field, keeping explicit opt-outs', () => {
    const cfg = resolveHistoryConfig(DEF);
    expect([...cfg.keys()].sort()).toEqual(['hourly.spo2', 'hourly.t', 'obs.hr', 'obs.note', 'obs.pain', 'obs.position']);
    expect(cfg.get('obs.note')).toEqual({ show: 'none' });
    expect(cfg.has('admission.ward')).toBe(false);
  });

  it('ignores a malformed history bag rather than inheriting garbage', () => {
    const bad = {
      ...DEF,
      uiSchema: {
        layout: {
          type: 'Group',
          options: { omf: { history: 'yes please' } },
          elements: [{ type: 'Control', scope: '#/properties/obs/properties/hr' }],
        },
      },
    } as unknown as FormDefinitionSchemas;
    expect(collectHistoryFields(bad)[0].history).toBeUndefined();
  });
});

describe('collectCodedItems.sectionPointer (ADR-006)', () => {
  it('addresses the nearest Group by its JSON pointer in the layout', () => {
    const rows = collectCodedItems(DEF.uiSchema, DEF.dataSchema);
    const byPath = new Map(rows.map((r) => [r.path, r]));
    expect(byPath.get('obs.hr')!.sectionPointer).toBe('/elements/0');
    expect(byPath.get('obs.pain')!.sectionPointer).toBe('/elements/0/elements/3');
    expect(byPath.get('admission.ward')!.sectionPointer).toBe('/elements/1');
  });

  it('is absent for a field outside any Group', () => {
    const rows = collectCodedItems(
      { layout: { type: 'VerticalLayout', elements: [{ type: 'Control', scope: '#/properties/obs/properties/hr' }] } } as never,
      DEF.dataSchema,
    );
    expect(rows[0].sectionPointer).toBeUndefined();
  });
});
