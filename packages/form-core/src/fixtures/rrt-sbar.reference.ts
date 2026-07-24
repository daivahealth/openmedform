/**
 * Reference FormDefinition (jsonforms engine) derived from the Greek
 * "ΑΝΑΦΟΡΑ ΟΜΑΔΑΣ ΑΜΕΣΗΣ ΑΝΤΑΠΟΚΡΙΣΗΣ" (Rapid Response Team / SBAR) PDF.
 *
 * Purpose (Phase 1): validate the Data/UI/Print contracts end-to-end before
 * building the AI generators, and demonstrate the two-column page layout
 * (left = reason-for-call checklist, right = SBAR narrative) that Form.io could
 * not express cleanly.
 *
 * It is intentionally a representative SUBSET of the paper form — enough to
 * exercise $defs/$ref, enum, formats, min/max, if/then, required, and the
 * two-track layout — not the entire form.
 */

import type { JsonFormsFormDefinition } from '@openmedform/form-schema-types';

const dataSchema: JsonFormsFormDefinition['dataSchema'] = {
  $schema: 'https://json-schema.org/draft/2020-12/schema',
  $id: 'https://openmedform.dev/schemas/rrt-sbar/1.0',
  type: 'object',
  $defs: {
    yesNo: { type: 'string', enum: ['YES', 'NO'] },
  },
  properties: {
    callDetails: {
      type: 'object',
      properties: {
        date: { type: 'string', format: 'date', title: 'Ημ/νία' },
        floorRoom: { type: 'string', maxLength: 50, title: 'Όροφος/Δωμάτιο' },
        callTime: { type: 'string', title: 'Ώρα κλήσης' },
        arrivalTime: { type: 'string', title: 'Ώρα άφιξης' },
        endTime: { type: 'string', title: 'Λήξη' },
      },
      required: ['date'],
      additionalProperties: false,
    },
    reasonForCall: {
      type: 'object',
      properties: {
        pulseLessThan40: { type: 'boolean', default: false },
        pulseGreaterThan130: { type: 'boolean', default: false },
        bpLessThan90: { type: 'boolean', default: false },
        consciousnessChange: { type: 'boolean', default: false },
        breathsLessThan8: { type: 'boolean', default: false },
        breathsGreaterThan24: { type: 'boolean', default: false },
        spo2LessThan91: { type: 'boolean', default: false },
        other: { type: 'string', maxLength: 200 },
      },
      additionalProperties: false,
    },
    situation: { type: 'string', maxLength: 4000 },
    background: { type: 'string', maxLength: 4000 },
    assessment: {
      type: 'object',
      properties: {
        temperature: { type: 'number', minimum: 25, maximum: 45 },
        bloodPressure: { type: 'string' },
        pulse: { type: 'integer', minimum: 0, maximum: 300 },
        respirations: { type: 'integer', minimum: 0, maximum: 100 },
        spo2: { type: 'integer', minimum: 0, maximum: 100 },
        glasgow: { type: 'integer', minimum: 3, maximum: 15 },
        avpu: {
          type: 'string',
          enum: ['ALERT', 'VOICE', 'PAIN', 'UNRESPONSIVE'],
        },
      },
      additionalProperties: false,
    },
    recommendation: { type: 'string', maxLength: 4000 },
    anticoagulantUse: { $ref: '#/$defs/yesNo' },
  },
  required: ['callDetails'],
  additionalProperties: false,
  // Conditional: if SpO2 is recorded and critically low (<= 91), a
  // recommendation becomes required. Exercises if/then/else at the root.
  allOf: [
    {
      if: {
        type: 'object',
        properties: {
          assessment: {
            type: 'object',
            properties: { spo2: { type: 'integer', maximum: 91 } },
            required: ['spo2'],
          },
        },
        required: ['assessment'],
      },
      then: { required: ['recommendation'] },
    },
  ],
};

const uiSchema: JsonFormsFormDefinition['uiSchema'] = {
  schemaVersion: '1.0',
  layout: {
    type: 'VerticalLayout',
    elements: [
      {
        type: 'Group',
        label: 'Στοιχεία Κλήσης',
        elements: [
          {
            type: 'HorizontalLayout',
            elements: [
              { type: 'Control', scope: '#/properties/callDetails/properties/date', options: { omf: { screen: { colSpan: 3 } } } },
              { type: 'Control', scope: '#/properties/callDetails/properties/floorRoom', options: { omf: { screen: { colSpan: 3 } } } },
              { type: 'Control', scope: '#/properties/callDetails/properties/callTime', options: { omf: { screen: { colSpan: 2 } } } },
              { type: 'Control', scope: '#/properties/callDetails/properties/arrivalTime', options: { omf: { screen: { colSpan: 2 } } } },
              { type: 'Control', scope: '#/properties/callDetails/properties/endTime', options: { omf: { screen: { colSpan: 2 } } } },
            ],
          },
        ],
      },
      // The two-track page split: left = reason-for-call checklist,
      // right = SBAR narrative. This is the layout Form.io scattered.
      {
        type: 'HorizontalLayout',
        options: { omf: { control: 'pageColumns' } },
        elements: [
          {
            type: 'VerticalLayout',
            options: { omf: { screen: { colSpan: 6 } } },
            elements: [
              { type: 'Label', text: 'Λόγος Κλήσης' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/pulseLessThan40' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/pulseGreaterThan130' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/bpLessThan90' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/consciousnessChange' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/breathsLessThan8' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/breathsGreaterThan24' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/spo2LessThan91' },
              { type: 'Control', scope: '#/properties/reasonForCall/properties/other', options: { omf: { screen: { rows: 2 } } } },
            ],
          },
          {
            type: 'VerticalLayout',
            options: { omf: { screen: { colSpan: 6 } } },
            elements: [
              {
                type: 'Control',
                scope: '#/properties/situation',
                label: 'Παρούσα Κατάσταση (Situation)',
                options: { omf: { control: 'textarea', screen: { rows: 6 }, print: { minHeightMm: 30, border: true } } },
              },
              {
                type: 'Control',
                scope: '#/properties/background',
                label: 'Ιστορικό Ασθενούς (Background)',
                options: { omf: { control: 'textarea', screen: { rows: 5 }, print: { minHeightMm: 24, border: true } } },
              },
              {
                type: 'Group',
                label: 'Εκτίμηση Ασθενούς (Assessment)',
                elements: [
                  {
                    type: 'HorizontalLayout',
                    elements: [
                      { type: 'Control', scope: '#/properties/assessment/properties/temperature', options: { omf: { screen: { colSpan: 2 } } } },
                      { type: 'Control', scope: '#/properties/assessment/properties/bloodPressure', options: { omf: { screen: { colSpan: 2 } } } },
                      { type: 'Control', scope: '#/properties/assessment/properties/pulse', options: { omf: { screen: { colSpan: 2 } } } },
                      { type: 'Control', scope: '#/properties/assessment/properties/respirations', options: { omf: { screen: { colSpan: 2 } } } },
                      { type: 'Control', scope: '#/properties/assessment/properties/spo2', options: { omf: { screen: { colSpan: 2 } } } },
                      { type: 'Control', scope: '#/properties/assessment/properties/glasgow', options: { omf: { screen: { colSpan: 2 } } } },
                    ],
                  },
                  { type: 'Control', scope: '#/properties/assessment/properties/avpu', options: { omf: { control: 'radio', screen: { inline: true } } } },
                ],
              },
              {
                type: 'Control',
                scope: '#/properties/recommendation',
                label: 'Συστάσεις (Recommendation)',
                options: { omf: { control: 'textarea', screen: { rows: 4 }, print: { minHeightMm: 20, border: true } } },
              },
            ],
          },
        ],
      },
    ],
  },
};

const printSchema: JsonFormsFormDefinition['printSchema'] = {
  schemaVersion: '1.0',
  pageSize: 'A4',
  orientation: 'portrait',
  marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
  repeatHeader: true,
  repeatPatientBlock: true,
  printSafeControls: true,
  blackAndWhite: true,
};

const translations: JsonFormsFormDefinition['translations'] = {
  defaultLanguage: 'el',
  languages: ['el', 'en'],
  entries: {
    'form.title': { el: 'Αναφορά Ομάδας Άμεσης Ανταπόκρισης', en: 'Rapid Response Team Report' },
    'assessment.avpu.ALERT': { el: 'Σε εγρήγορση', en: 'Alert' },
    'assessment.avpu.VOICE': { el: 'Σε φωνή', en: 'Voice' },
    'assessment.avpu.PAIN': { el: 'Σε πόνο', en: 'Pain' },
    'assessment.avpu.UNRESPONSIVE': { el: 'Χωρίς ανταπόκριση', en: 'Unresponsive' },
    'validation.required': { el: 'Υποχρεωτικό πεδίο', en: 'This field is required' },
  },
};

export const rrtSbarReference: JsonFormsFormDefinition = {
  id: 'ref-rrt-sbar-0001',
  formCode: 'HYG.F814.02',
  name: 'ΑΝΑΦΟΡΑ ΟΜΑΔΑΣ ΑΜΕΣΗΣ ΑΝΤΑΠΟΚΡΙΣΗΣ',
  description: 'Rapid Response Team report (SBAR). Phase-1 reference definition.',
  version: '1.0',
  language: 'el',
  status: 'DRAFT',
  engine: 'jsonforms',
  dataSchema,
  uiSchema,
  printSchema,
  translations,
  assets: [],
  conversionMetadata: {
    pageCount: 1,
    formTitle: 'ΑΝΑΦΟΡΑ ΟΜΑΔΑΣ ΑΜΕΣΗΣ ΑΝΤΑΠΟΚΡΙΣΗΣ',
    formCode: 'HYG.F814.02',
    generatedAt: '2026-07-24T00:00:00.000Z',
    provider: 'reference',
    model: 'hand-authored',
    fields: [
      { binding: '#/properties/situation', sourcePage: 1, confidence: 0.98, warnings: [] },
      {
        binding: '#/properties/assessment/properties/avpu',
        sourcePage: 1,
        confidence: 0.72,
        warnings: [
          {
            type: 'UNCERTAIN_TRANSLATION',
            message: 'AVPU option labels inferred; confirm Greek wording.',
            binding: '#/properties/assessment/properties/avpu',
            sourcePage: 1,
          },
        ],
      },
    ],
    warnings: [],
    similarityScore: undefined,
  },
  audit: {
    createdAt: '2026-07-24T00:00:00.000Z',
    createdBy: 'reference',
    updatedAt: '2026-07-24T00:00:00.000Z',
    updatedBy: 'reference',
  },
};
