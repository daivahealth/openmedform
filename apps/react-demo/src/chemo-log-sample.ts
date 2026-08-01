/**
 * Chemotherapy Monitoring — the repeating treatment-day log.
 *
 * Modelled on the real source that motivated the `recordTable` control
 * (NH/CHEMO/001 consolidated sheet). Its markup ships a nine-column `<thead>`,
 * an EMPTY `<tbody id="cx_tbody">` and an "+ Add treatment day" button, with
 * every row's ~100 fields built at runtime by 123 KB of script across eight
 * tabbed stages. Scripts are stripped during conversion and the page is never
 * executed, so the log has to be reconstructed from the header row and the
 * button label — which is exactly what this definition demonstrates.
 *
 * Trimmed to a representative subset of each stage; the shape (array of records,
 * summary columns, tabbed detail) is the point, not the full field inventory.
 */

import type { FormDefinition } from '@openmedform/form-schema-types';

const text = (title: string) => ({ type: 'string', title });

export const chemoLogSample = {
  id: 'chemo-monitoring',
  formCode: 'NH/CHEMO/001',
  name: 'Chemotherapy Monitoring & Order Form',
  version: 1,
  language: 'en',
  status: 'DRAFT',
  engine: 'jsonforms',
  dataSchema: {
    type: 'object',
    properties: {
      treatmentDays: {
        type: 'array',
        title: 'Treatment day',
        items: {
          type: 'object',
          properties: {
            day: text('Day'),
            date: { type: 'string', format: 'date', title: 'Date' },
            order: {
              type: 'object',
              properties: {
                diagnosis: text('Diagnosis'),
                consultantOrder: text('Consultant order'),
                protocol: text('Treatment regimen / protocol'),
                allergies: text('Allergies'),
                height: { type: 'number', title: 'Height (cm)' },
                weight: { type: 'number', title: 'Weight (kg)' },
                bsa: { type: 'number', title: 'BSA (m²)' },
              },
            },
            canula: {
              type: 'object',
              properties: {
                accessDevice: {
                  type: 'string',
                  title: 'Access device',
                  enum: ['Peripheral cannula', 'PICC', 'Port', 'Central line'],
                },
                patency: { type: 'string', title: 'Patency', enum: ['Patent', 'Sluggish', 'Blocked'] },
                extravasationSuspected: { type: 'boolean', title: 'Extravasation suspected' },
              },
            },
            orders: {
              type: 'object',
              properties: {
                holdANC: text('Hold if ANC below'),
                holdPLTS: text('Hold if platelets below'),
                hydrationPre: text('Pre-hydration'),
                hydrationPost: text('Post-hydration'),
              },
            },
            timelog: {
              type: 'object',
              properties: {
                cycle: text('Cycle'),
                dayNum: text('Day #'),
                startTime: { type: 'string', title: 'Start time' },
                finishTime: { type: 'string', title: 'Finish time' },
              },
            },
            drugs: {
              type: 'array',
              title: 'Drug',
              items: {
                type: 'object',
                properties: {
                  name: text('Drug'),
                  dose: text('Dose'),
                  route: { type: 'string', title: 'Route', enum: ['IV', 'PO', 'SC', 'IM'] },
                  givenBy: text('Given by'),
                },
              },
            },
            baseline: {
              type: 'object',
              properties: {
                temp: { type: 'number', title: 'Temp (°C)' },
                hr: { type: 'number', title: 'HR' },
                bp: text('BP'),
                spo2: { type: 'number', title: 'SpO₂ (%)' },
                painScore: { type: 'number', title: 'Pain score' },
              },
            },
            post: {
              type: 'object',
              properties: {
                ivLineStatus: {
                  type: 'string',
                  title: 'IV line status',
                  enum: ['Removed', 'Heparin locked', 'Retained'],
                },
                patientEducation: text('Patient education given'),
                nurseName: text('Nurse'),
              },
            },
            adverseEvents: {
              type: 'array',
              title: 'Adverse event',
              items: {
                type: 'object',
                properties: {
                  description: text('Event'),
                  grade: { type: 'string', title: 'Grade', enum: ['1', '2', '3', '4', '5'] },
                  actionTaken: text('Action taken'),
                },
              },
            },
            nurse: text('Nurse'),
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
                emptyLabel:
                  'No treatment days logged for this month yet. Click "Add treatment day" to begin.',
                removeConfirm: 'Remove this treatment day record?',
                columns: [
                  { label: 'Day', path: 'day', width: '70px' },
                  { label: 'Date', path: 'date' },
                  { label: 'Cycle / Day#', path: 'timelog.cycle', pairWith: 'timelog.dayNum' },
                  {
                    label: 'Start / Finish',
                    path: 'timelog.startTime',
                    pairWith: 'timelog.finishTime',
                  },
                  { label: 'Drugs', countOf: 'drugs', align: 'center' },
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
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/order/properties/diagnosis' },
                        { type: 'Control', scope: '#/properties/order/properties/consultantOrder' },
                        { type: 'Control', scope: '#/properties/order/properties/protocol' },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/order/properties/allergies' },
                        { type: 'Control', scope: '#/properties/order/properties/height' },
                        { type: 'Control', scope: '#/properties/order/properties/weight' },
                      ],
                    },
                    { type: 'Control', scope: '#/properties/order/properties/bsa' },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Vascular Access & Site Assessment',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/canula/properties/accessDevice' },
                        { type: 'Control', scope: '#/properties/canula/properties/patency' },
                      ],
                    },
                    {
                      type: 'Control',
                      scope: '#/properties/canula/properties/extravasationSuspected',
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Treatment Orders',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/orders/properties/holdANC' },
                        { type: 'Control', scope: '#/properties/orders/properties/holdPLTS' },
                      ],
                    },
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/orders/properties/hydrationPre' },
                        { type: 'Control', scope: '#/properties/orders/properties/hydrationPost' },
                      ],
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Time / Cycle Log',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/timelog/properties/cycle' },
                        { type: 'Control', scope: '#/properties/timelog/properties/dayNum' },
                        { type: 'Control', scope: '#/properties/timelog/properties/startTime' },
                        { type: 'Control', scope: '#/properties/timelog/properties/finishTime' },
                      ],
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Drug Administration',
                  elements: [
                    {
                      // A record table nested inside a record's detail panel:
                      // each treatment day has its own add/remove drug list.
                      type: 'Control',
                      scope: '#/properties/drugs',
                      options: {
                        omf: {
                          control: 'recordTable',
                          recordTable: {
                            addLabel: '+ Add drug',
                            countLabel: '{n} drug{s} administered',
                            emptyLabel: 'No drugs recorded for this treatment day.',
                            columns: [
                              { label: 'Drug', path: 'name' },
                              { label: 'Dose', path: 'dose' },
                              { label: 'Route', path: 'route' },
                              { label: 'Given by', path: 'givenBy' },
                            ],
                          },
                        },
                        detail: {
                          type: 'VerticalLayout',
                          elements: [
                            { type: 'Control', scope: '#/properties/name' },
                            { type: 'Control', scope: '#/properties/dose' },
                            { type: 'Control', scope: '#/properties/route' },
                            { type: 'Control', scope: '#/properties/givenBy' },
                          ],
                        },
                      },
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Assessment & Monitoring',
                  elements: [
                    {
                      type: 'HorizontalLayout',
                      elements: [
                        { type: 'Control', scope: '#/properties/baseline/properties/temp' },
                        { type: 'Control', scope: '#/properties/baseline/properties/hr' },
                        { type: 'Control', scope: '#/properties/baseline/properties/bp' },
                        { type: 'Control', scope: '#/properties/baseline/properties/spo2' },
                        { type: 'Control', scope: '#/properties/baseline/properties/painScore' },
                      ],
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Post-Procedure / Discharge',
                  elements: [
                    { type: 'Control', scope: '#/properties/post/properties/ivLineStatus' },
                    { type: 'Control', scope: '#/properties/post/properties/patientEducation' },
                    { type: 'Control', scope: '#/properties/post/properties/nurseName' },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Adverse Events',
                  elements: [
                    {
                      type: 'Control',
                      scope: '#/properties/adverseEvents',
                      options: {
                        omf: {
                          control: 'recordTable',
                          recordTable: {
                            addLabel: '+ Add adverse event',
                            countLabel: '{n} adverse event{s} recorded',
                            emptyLabel: 'No adverse events recorded for this treatment day.',
                            columns: [
                              { label: 'Event', path: 'description' },
                              { label: 'Grade', path: 'grade', align: 'center' },
                              { label: 'Action taken', path: 'actionTaken' },
                            ],
                          },
                        },
                        detail: {
                          type: 'VerticalLayout',
                          elements: [
                            { type: 'Control', scope: '#/properties/description' },
                            { type: 'Control', scope: '#/properties/grade' },
                            { type: 'Control', scope: '#/properties/actionTaken' },
                          ],
                        },
                      },
                    },
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  },
  printSchema: {
    schemaVersion: '1.0',
    page: { size: 'A4', orientation: 'landscape', marginsMm: { top: 12, right: 10, bottom: 12, left: 10 } },
  },
} as unknown as FormDefinition;
