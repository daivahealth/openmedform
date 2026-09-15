/**
 * Test fixtures for the observation module: a small vitals form in two
 * versions (a field renamed and moved between them) plus a different form
 * that shares one LOINC binding, and a 24-hour chart built on a recordTable.
 */

import type { FormDefinitionSchemas, OmfCoding, UiSchema } from '@openmedform/form-schema-types';

export const LOINC_HR: OmfCoding = {
  system: 'http://loinc.org',
  code: '8867-4',
  display: 'Heart rate',
  source: 'human',
  verified: true,
};

export const LOINC_SYS: OmfCoding = {
  system: 'http://loinc.org',
  code: '8480-6',
  display: 'Systolic blood pressure',
  source: 'human',
  verified: true,
};

export const LOINC_TEMP: OmfCoding = {
  system: 'http://loinc.org',
  code: '8310-5',
  display: 'Body temperature',
  source: 'ai',
  confidence: 0.9,
  verified: false,
};

export const SNOMED_ALERT: OmfCoding = {
  system: 'http://snomed.info/sct',
  code: '248234008',
  display: 'Mentally alert',
  source: 'human',
  verified: true,
};

/** Vitals v2: heart rate is `vitals.pulse`, temperature in Celsius, unbound SpO2. */
export const VITALS_V2: FormDefinitionSchemas = {
  dataSchema: {
    type: 'object',
    properties: {
      vitals: {
        type: 'object',
        properties: {
          pulse: { type: 'number', title: 'Pulse' },
          systolic: { type: 'integer', title: 'Systolic BP' },
          temp: { type: 'number', title: 'Temperature (°C)' },
          spo2: { type: 'number', title: 'SpO2' },
          avpu: {
            type: 'string',
            title: 'AVPU',
            oneOf: [
              { const: 'ALERT', title: 'Alert' },
              { const: 'VERBAL', title: 'Verbal' },
            ],
          },
          symptoms: {
            type: 'array',
            title: 'Symptoms',
            items: { type: 'string', oneOf: [{ const: 'SOB', title: 'Short of breath' }, { const: 'PAIN', title: 'Pain' }] },
          },
          onOxygen: { type: 'boolean', title: 'On oxygen' },
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
            { type: 'Control', scope: '#/properties/vitals/properties/systolic', options: { omf: { coding: [LOINC_SYS], unit: 'mm[Hg]' } } },
            { type: 'Control', scope: '#/properties/vitals/properties/temp', options: { omf: { coding: [LOINC_TEMP], unit: 'Cel' } } },
            { type: 'Control', scope: '#/properties/vitals/properties/spo2', options: { omf: { unit: '%' } } },
            { type: 'Control', scope: '#/properties/vitals/properties/avpu', options: { omf: { optionCoding: { ALERT: [SNOMED_ALERT] } } } },
            { type: 'Control', scope: '#/properties/vitals/properties/symptoms' },
            { type: 'Control', scope: '#/properties/vitals/properties/onOxygen' },
          ],
        },
        { type: 'Control', scope: '#/properties/notes' },
      ],
    },
  } as unknown as UiSchema,
};

/** Vitals v3: heart rate renamed and moved to `obs.heartRate`; SpO2 still unbound at the same path. */
export const VITALS_V3: FormDefinitionSchemas = {
  dataSchema: {
    type: 'object',
    properties: {
      obs: {
        type: 'object',
        properties: {
          heartRate: { type: 'number', title: 'Heart rate' },
        },
      },
      vitals: {
        type: 'object',
        properties: {
          spo2: { type: 'number', title: 'SpO2' },
          temp: { type: 'number', title: 'Temperature (°F)' },
        },
      },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        { type: 'Control', scope: '#/properties/obs/properties/heartRate', options: { omf: { coding: [LOINC_HR], unit: '/min' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/spo2', options: { omf: { unit: '%' } } },
        { type: 'Control', scope: '#/properties/vitals/properties/temp', options: { omf: { coding: [LOINC_TEMP], unit: '[degF]' } } },
      ],
    },
  } as unknown as UiSchema,
};

/** A 24-hour chart: one response, one record per hour, each with its own time. */
export const ICU_CHART: FormDefinitionSchemas = {
  dataSchema: {
    type: 'object',
    properties: {
      hourly: {
        type: 'array',
        title: 'Hourly observations',
        items: {
          type: 'object',
          properties: {
            observedAt: { type: 'string', format: 'date-time', title: 'Time' },
            hr: { type: 'number', title: 'HR' },
            position: { type: 'string', title: 'Position', enum: ['SUPINE', 'PRONE'] },
          },
        },
      },
    },
  },
  uiSchema: {
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Control',
          scope: '#/properties/hourly',
          options: {
            detail: {
              type: 'VerticalLayout',
              elements: [
                { type: 'Control', scope: '#/properties/observedAt' },
                { type: 'Control', scope: '#/properties/hr', options: { omf: { coding: [LOINC_HR], unit: '/min' } } },
                { type: 'Control', scope: '#/properties/position', options: { omf: { optionLabels: { SUPINE: 'Supine', PRONE: 'Prone' } } } },
              ],
            },
            omf: { control: 'recordTable', recordTable: { effectiveAtPath: 'observedAt' } },
          },
        },
      ],
    },
  } as unknown as UiSchema,
};
