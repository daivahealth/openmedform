/**
 * A compact VTE-style scored-checklist sample proving the colour-coded,
 * icon-headed domain boxes with per-row point badges (the layout the AI
 * conversion now targets). Data Schema = booleans + one enum; UI Schema =
 * Groups carrying options.omf.accentColor / icon / pointLegend and Controls
 * carrying options.omf.points.
 */

import type { FormDefinition } from '@openmedform/form-schema-types';

export const vteSample: FormDefinition = {
  id: 'vte-sample',
  formCode: 'vte-risk',
  name: 'VTE Risk Assessment (scored checklist sample)',
  version: '1',
  language: 'en',
  status: 'DRAFT',
  engine: 'jsonforms',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      patientCategory: {
        type: 'string',
        title: 'Patient category (select one)',
        enum: ['MEDICAL', 'SURGICAL_GENERAL_GYNAECOLOGY', 'SURGICAL_ORTHOPAEDIC', 'PAEDIATRIC'],
      },
      age: {
        type: 'object',
        additionalProperties: false,
        properties: {
          age41to60: { type: 'boolean', title: 'Age 41–60 years' },
          age61to74: { type: 'boolean', title: 'Age 61–74 years' },
          age75plus: { type: 'boolean', title: 'Age ≥75 years' },
        },
      },
      cardiovascular: {
        type: 'object',
        additionalProperties: false,
        properties: {
          acuteMI: { type: 'boolean', title: 'Acute Myocardial Infarction' },
          chf: { type: 'boolean', title: 'Congestive Heart Failure (<1 month)' },
          varicoseVeins: { type: 'boolean', title: 'Varicose veins' },
          swollenLegs: { type: 'boolean', title: 'Swollen legs (current)' },
        },
      },
      surgical: {
        type: 'object',
        additionalProperties: false,
        properties: {
          minorSurgery: { type: 'boolean', title: 'Minor surgery planned' },
          majorSurgery45: { type: 'boolean', title: 'Major surgery >45 minutes' },
          arthroplasty: { type: 'boolean', title: 'Elective major lower extremity arthroplasty' },
        },
      },
      accp: {
        type: 'object',
        additionalProperties: false,
        properties: {
          chf: { type: 'string', title: 'Congestive Heart Failure', enum: ['YES', 'NO'] },
          respiratory: { type: 'string', title: 'Severe respiratory disease (e.g., COPD or ILD)', enum: ['YES', 'NO'] },
          stroke: { type: 'string', title: 'Acute ischaemic stroke', enum: ['YES', 'NO'] },
          cancer: { type: 'string', title: 'Active cancer or malignancy-associated disease', enum: ['YES', 'NO'] },
          sepsis: { type: 'string', title: 'Sepsis (e.g., severe pneumonia)', enum: ['YES', 'NO'] },
        },
      },
      totalScore: { type: 'number', title: 'TOTAL VTE RISK SCORE' },
      contra: {
        type: 'object',
        additionalProperties: false,
        properties: {
          activeBleeding: { type: 'boolean', title: 'Active bleeding (e.g., GI, CNS)' },
          coagulopathy: { type: 'boolean', title: 'Coagulopathy (INR >1.5 or aPTT >40 sec)' },
          severePad: { type: 'boolean', title: 'Severe peripheral arterial disease' },
          acuteChf: { type: 'boolean', title: 'Congestive Heart Failure (acute)' },
        },
      },
      orders: {
        type: 'object',
        additionalProperties: false,
        properties: {
          stockings: { type: 'boolean', title: 'Graduated (anti-embolic) compression stockings' },
          ipc: { type: 'boolean', title: 'Intermittent Pneumatic Compression (IPC) device' },
          enoxaparin40: { type: 'boolean', title: 'Enoxaparin 40 mg SC once daily (CrCl >30, wt <150 kg)' },
          ufh5000: { type: 'boolean', title: 'UFH 5000 IU SC every 8–12 hours' },
        },
      },
      nursingReassessment: { type: 'object', title: 'Nursing diagnosis & daily reassessment' },
    },
  },
  uiSchema: {
    schemaVersion: '1.0',
    layout: {
      type: 'VerticalLayout',
      elements: [
        {
          type: 'Group',
          label: 'PATIENT CATEGORY (SELECT ONE)',
          elements: [
            {
              type: 'Control',
              scope: '#/properties/patientCategory',
              options: { omf: { control: 'radio', screen: { inline: true } } },
            },
          ],
        },
        {
          type: 'Group',
          label: 'AGE',
          options: { omf: { accentColor: '#5b53c6', icon: '🎂', pointLegend: [1, 2, 3] } },
          elements: [
            { type: 'Control', scope: '#/properties/age/properties/age41to60', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/age/properties/age61to74', options: { omf: { points: 2 } } },
            { type: 'Control', scope: '#/properties/age/properties/age75plus', options: { omf: { points: 3 } } },
          ],
        },
        {
          type: 'Group',
          label: 'CARDIOVASCULAR',
          options: { omf: { accentColor: '#c0392b', icon: '❤️', pointLegend: [1] } },
          elements: [
            { type: 'Control', scope: '#/properties/cardiovascular/properties/acuteMI', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/cardiovascular/properties/chf', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/cardiovascular/properties/varicoseVeins', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/cardiovascular/properties/swollenLegs', options: { omf: { points: 1 } } },
          ],
        },
        {
          type: 'Group',
          label: 'SURGICAL & PROCEDURAL',
          options: { omf: { accentColor: '#1e8e5a', icon: '🔪', pointLegend: [1, 2, 5] } },
          elements: [
            { type: 'Control', scope: '#/properties/surgical/properties/minorSurgery', options: { omf: { points: 1 } } },
            { type: 'Control', scope: '#/properties/surgical/properties/majorSurgery45', options: { omf: { points: 2 } } },
            { type: 'Control', scope: '#/properties/surgical/properties/arthroplasty', options: { omf: { points: 5 } } },
          ],
        },
        {
          type: 'Group',
          label: 'ACCP MEDICAL VTE TRIGGER CHECK',
          elements: [
            { type: 'Label', text: 'Does the patient have at least one of the following three ACCP risk factors?' },
            { type: 'Control', scope: '#/properties/accp/properties/chf', options: { omf: { control: 'radio' } } },
            { type: 'Control', scope: '#/properties/accp/properties/respiratory', options: { omf: { control: 'radio' } } },
            // Compound criterion: a heading (no radio of its own) with its factors nested beneath.
            {
              type: 'Group',
              label: 'Immobility (confined to bed or needs assistance to ambulate) PLUS one or more of:',
              options: { omf: { variant: 'subsection' } },
              elements: [
                { type: 'Control', scope: '#/properties/accp/properties/stroke', options: { omf: { control: 'radio' } } },
                { type: 'Control', scope: '#/properties/accp/properties/cancer', options: { omf: { control: 'radio' } } },
                { type: 'Control', scope: '#/properties/accp/properties/sepsis', options: { omf: { control: 'radio' } } },
              ],
            },
          ],
        },
        {
          type: 'Control',
          scope: '#/properties/totalScore',
          label: 'TOTAL VTE RISK SCORE',
          options: {
            omf: {
              control: 'scoreSummary',
              bands: [
                { maxScore: 1, label: 'Low risk', color: '#1e8e5a' },
                { minScore: 2, maxScore: 4, label: 'Moderate risk', color: '#b8860b' },
                { minScore: 5, label: 'High risk', color: '#c0392b' },
              ],
            },
          },
        },
        // Section 5: two contraindication boxes side by side.
        {
          type: 'HorizontalLayout',
          elements: [
            {
              type: 'Group',
              label: 'ANTICOAGULANT CONTRAINDICATIONS',
              options: { omf: { accentColor: '#c0392b', icon: '⚠️' } },
              elements: [
                { type: 'Control', scope: '#/properties/contra/properties/activeBleeding' },
                { type: 'Control', scope: '#/properties/contra/properties/coagulopathy' },
              ],
            },
            {
              type: 'Group',
              label: 'SCD CONTRAINDICATIONS',
              options: { omf: { accentColor: '#b8860b', icon: '⚡' } },
              elements: [
                { type: 'Control', scope: '#/properties/contra/properties/severePad' },
                { type: 'Control', scope: '#/properties/contra/properties/acuteChf' },
              ],
            },
          ],
        },
        // Section 6: mechanical vs pharmacologic, two columns.
        {
          type: 'Group',
          label: "PHYSICIAN'S PROPHYLAXIS ORDERS",
          elements: [
            {
              type: 'HorizontalLayout',
              elements: [
                {
                  type: 'Group',
                  label: 'MECHANICAL PROPHYLAXIS',
                  options: { omf: { variant: 'subsection' } },
                  elements: [
                    { type: 'Control', scope: '#/properties/orders/properties/stockings' },
                    { type: 'Control', scope: '#/properties/orders/properties/ipc' },
                  ],
                },
                {
                  type: 'Group',
                  label: 'PHARMACOLOGIC PROPHYLAXIS',
                  options: { omf: { variant: 'subsection' } },
                  elements: [
                    { type: 'Control', scope: '#/properties/orders/properties/enoxaparin40' },
                    { type: 'Control', scope: '#/properties/orders/properties/ufh5000' },
                  ],
                },
              ],
            },
          ],
        },
        // Section 7: nursing diagnosis × Day 1–5 checkbox matrix.
        {
          type: 'Group',
          label: 'NURSING DIAGNOSIS & DAILY REASSESSMENT',
          elements: [
            {
              type: 'Control',
              scope: '#/properties/nursingReassessment',
              label: false,
              options: {
                omf: {
                  control: 'checklistMatrix',
                  rows: [
                    { key: 'potentialVte', label: 'Potential risk for VTE' },
                    { key: 'impairedGasExchange', label: 'Risk for impaired gas exchange (PE suspected / diagnosed)' },
                    { key: 'skinInjury', label: 'Risk of skin injury and pressure ulcer' },
                    { key: 'bleedingRisk', label: 'Risk for bleeding related to anticoagulant therapy' },
                  ],
                  columns: [
                    { key: 'day1', label: 'Day 1' },
                    { key: 'day2', label: 'Day 2' },
                    { key: 'day3', label: 'Day 3' },
                    { key: 'day4', label: 'Day 4' },
                    { key: 'day5', label: 'Day 5' },
                  ],
                },
              },
            },
          ],
        },
      ],
    },
  },
  printSchema: {
    schemaVersion: '1.0',
    pageSize: 'A4',
    orientation: 'portrait',
    marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
  },
  translations: { defaultLanguage: 'en', languages: ['en'], entries: {} },
  assets: [],
  audit: { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
};
