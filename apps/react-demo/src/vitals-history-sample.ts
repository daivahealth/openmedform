/**
 * Ward vitals with HISTORY — what an EMR host sees when it hands the renderer
 * the patient's earlier fills (ADR-005).
 *
 * The current definition is v3. Two of the prior fills were taken against v2,
 * where heart rate was called "Pulse" and lived at a different path; they line
 * up under "Heart rate" because both versions bind the field to LOINC 8867-4.
 * SpO2 is deliberately unbound so its history rides on the (unchanged) path
 * alone. Temperature changed unit between versions, which the chip flags
 * rather than converting.
 */

import type { FormDefinition, FormDefinitionSchemas, HistoryEntry } from '@openmedform/form-schema-types';

const loinc = (code: string, display: string) => ({
  system: 'http://loinc.org',
  code,
  display,
  source: 'human' as const,
  verified: true,
});
const HR = loinc('8867-4', 'Heart rate');
const SYS = loinc('8480-6', 'Systolic blood pressure');
const DIA = loinc('8462-4', 'Diastolic blood pressure');
const TEMP = loinc('8310-5', 'Body temperature');
const RR = loinc('9279-1', 'Respiratory rate');

export const vitalsHistorySample = {
  id: 'vitals-v3',
  formCode: 'NH/VITALS/001',
  name: 'Ward Vitals (q2h)',
  version: 3,
  language: 'en',
  status: 'PUBLISHED',
  dataSchema: {
    type: 'object',
    properties: {
      obs: {
        type: 'object',
        properties: {
          heartRate: { type: 'integer', title: 'Heart rate' },
          systolic: { type: 'integer', title: 'Systolic BP' },
          diastolic: { type: 'integer', title: 'Diastolic BP' },
          respRate: { type: 'integer', title: 'Respiratory rate' },
          temp: { type: 'number', title: 'Temperature (°F)' },
          spo2: { type: 'integer', title: 'SpO2' },
          onOxygen: { type: 'boolean', title: 'On supplemental oxygen' },
          avpu: {
            type: 'string',
            title: 'AVPU',
            oneOf: [
              { const: 'ALERT', title: 'Alert' },
              { const: 'VERBAL', title: 'Verbal' },
              { const: 'PAIN', title: 'Pain' },
              { const: 'UNRESPONSIVE', title: 'Unresponsive' },
            ],
          },
        },
      },
      notes: { type: 'string', title: 'Notes' },
    },
  },
  uiSchema: {
    schemaVersion: '1.0',
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Group',
          label: 'Observations',
          options: { omf: { accentColor: '#1e8e5a', icon: '❤️' } },
          elements: [
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/obs/properties/heartRate', options: { omf: { coding: [HR], unit: '/min', history: { show: 'inline' } } } },
                { type: 'Control', scope: '#/properties/obs/properties/respRate', options: { omf: { coding: [RR], unit: '/min', history: { show: 'inline' } } } },
              ],
            },
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/obs/properties/systolic', options: { omf: { coding: [SYS], unit: 'mm[Hg]', history: { show: 'inline' } } } },
                { type: 'Control', scope: '#/properties/obs/properties/diastolic', options: { omf: { coding: [DIA], unit: 'mm[Hg]', history: { show: 'inline' } } } },
              ],
            },
            {
              type: 'HorizontalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/obs/properties/temp', options: { omf: { coding: [TEMP], unit: '[degF]', history: { show: 'inline' } } } },
                { type: 'Control', scope: '#/properties/obs/properties/spo2', options: { omf: { unit: '%', history: { show: 'inline', count: 8 } } } },
              ],
            },
            { type: 'Control', scope: '#/properties/obs/properties/onOxygen', options: { omf: { history: { show: 'popover' } } } },
            { type: 'Control', scope: '#/properties/obs/properties/avpu', options: { omf: { control: 'radio', history: { show: 'popover' } } } },
          ],
        },
        { type: 'Control', scope: '#/properties/notes', options: { omf: { control: 'textarea' } } },
      ],
    },
  },
  printSchema: {},
  translations: {},
  assets: [],
  audit: {},
} as unknown as FormDefinition;

/** v2 of the same form: "Pulse" at vitals.pulse, temperature in Celsius. */
const vitalsV2 = {
  dataSchema: {
    type: 'object',
    properties: {
      vitals: {
        type: 'object',
        properties: {
          pulse: { type: 'integer', title: 'Pulse' },
          sbp: { type: 'integer', title: 'SBP' },
          dbp: { type: 'integer', title: 'DBP' },
          rr: { type: 'integer', title: 'RR' },
          tempC: { type: 'number', title: 'Temp (°C)' },
        },
      },
      obs: {
        type: 'object',
        properties: {
          spo2: { type: 'integer', title: 'SpO2' },
          avpu: { type: 'string', title: 'AVPU', oneOf: [{ const: 'ALERT', title: 'Alert' }, { const: 'VERBAL', title: 'Verbal' }] },
          onOxygen: { type: 'boolean', title: 'On oxygen' },
        },
      },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/vitals/properties/pulse', options: { omf: { coding: [HR], unit: '/min' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/sbp', options: { omf: { coding: [SYS], unit: 'mm[Hg]' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/dbp', options: { omf: { coding: [DIA], unit: 'mm[Hg]' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/rr', options: { omf: { coding: [RR], unit: '/min' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/tempC', options: { omf: { coding: [TEMP], unit: 'Cel' } } },
        { type: 'Control', scope: '#/properties/obs/properties/spo2', options: { omf: { unit: '%' } } },
        { type: 'Control', scope: '#/properties/obs/properties/avpu' },
        { type: 'Control', scope: '#/properties/obs/properties/onOxygen' },
      ],
    },
  },
} as unknown as FormDefinitionSchemas;

/** Rounds every two hours up to now, on the hour, so the chips read "2h ago". */
const at = (hoursAgo: number) => {
  const d = new Date();
  d.setMinutes(0, 0, 0);
  d.setHours(d.getHours() - hoursAgo);
  return d.toISOString();
};

/** What the EMR would pass: the shift so far, oldest two against v2. */
export const vitalsHistoryEntries: HistoryEntry[] = [
  {
    effectiveAt: at(6),
    definition: vitalsV2,
    author: 'RN Priya',
    data: { vitals: { pulse: 96, sbp: 142, dbp: 88, rr: 20, tempC: 37.4 }, obs: { spo2: 94, avpu: 'VERBAL', onOxygen: true } },
  },
  {
    effectiveAt: at(4),
    definition: vitalsV2,
    author: 'RN Priya',
    data: { vitals: { pulse: 92, sbp: 138, dbp: 86, rr: 18, tempC: 37.1 }, obs: { spo2: 95, avpu: 'ALERT', onOxygen: true } },
  },
  {
    effectiveAt: at(2),
    author: 'RN Arun',
    data: { obs: { heartRate: 88, systolic: 134, diastolic: 84, respRate: 18, temp: 98.6, spo2: 96, avpu: 'ALERT', onOxygen: false } },
  },
];
