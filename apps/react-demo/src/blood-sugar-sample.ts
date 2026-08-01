/**
 * Blood Sugar Monitoring Chart — a wide, fully inline-editable log.
 *
 * Every field is a column, so there is no detail panel: a nurse types straight
 * into the row exactly as on the paper chart. Also the widest table in the demo
 * (nine columns plus actions), which is what makes the pinned actions column
 * visible — without it, Open/remove scroll off the right edge.
 */

import type { FormDefinition } from '@openmedform/form-schema-types';

export const bloodSugarSample = {
  id: 'bgs',
  formCode: 'NH/BGS/001',
  name: 'Blood Sugar Monitoring Chart',
  version: 1,
  language: 'en',
  status: 'DRAFT',
  dataSchema: {
    type: 'object',
    properties: {
      readings: {
        type: 'array',
        title: 'Reading',
        items: {
          type: 'object',
          properties: {
            day: {
              type: 'string',
              title: 'Day',
              enum: Array.from({ length: 15 }, (_, i) => `Day ${i + 1}`),
            },
            date: { type: 'string', format: 'date', title: 'Date' },
            time: { type: 'string', title: 'Time (24h)' },
            grbs: { type: 'number', title: 'GRBS (mg/dL)' },
            drugType: { type: 'string', title: 'Drug / Dose', enum: ['OHA', 'Insulin', 'Other'] },
            intervention: { type: 'string', title: 'Intervention (auto by glycaemia category)' },
            potassium: { type: 'number', title: 'S. K⁺ (mEq/L)' },
            creatinine: { type: 'number', title: 'S. Creatinine (mg/dL)' },
            nurse: { type: 'string', title: 'Nurse / EC Code' },
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
          type: 'Label',
          text:
            'GRBS reference (mg/dL): Severe Hypoglycaemia <40 | Moderate 40–53 | Mild 54–70 | ' +
            'Normoglycaemia 71–180 | Hyperglycaemia >180',
        },
        {
          type: 'Control',
          scope: '#/properties/readings',
          options: {
            omf: {
              control: 'recordTable',
              recordTable: {
                addLabel: '+ Add Row',
                countLabel: '{n} reading{s} logged',
                emptyLabel: 'No readings logged yet.',
                removeConfirm: 'Remove this reading?',
                columns: [
                  { label: 'Day', path: 'day' },
                  { label: 'Date', path: 'date' },
                  { label: 'Time (24h)', path: 'time' },
                  { label: 'GRBS (mg/dL)', path: 'grbs' },
                  { label: 'Drug / Dose', path: 'drugType' },
                  { label: 'Intervention', path: 'intervention' },
                  { label: 'S. K⁺', path: 'potassium' },
                  { label: 'S. Creatinine', path: 'creatinine' },
                  { label: 'Nurse / EC Code', path: 'nurse' },
                ],
              },
            },
          },
        },
      ],
    },
  },
  printSchema: { schemaVersion: '1.0', page: { size: 'A4', orientation: 'landscape' } },
} as unknown as FormDefinition;
