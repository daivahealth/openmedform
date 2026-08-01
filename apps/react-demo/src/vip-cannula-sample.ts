/**
 * VIP cannula chart — a COLUMN-oriented record table.
 *
 * Mirrors the paper form: parameters down the left, one column per cannula,
 * each cannula carrying its own nested repeating "day" assessment. This is the
 * shape produced by the transposed-matrix hint in the conversion pipeline.
 */

import type { FormDefinition } from '@openmedform/form-schema-types';

const text = (title: string) => ({ type: 'string', title });

export const vipCannulaSample = {
  id: 'vip',
  formCode: 'NH/VIP/001',
  name: 'Visual Infusion Phlebitis Score (VIP)',
  version: 1,
  language: 'en',
  status: 'DRAFT',
  dataSchema: {
    type: 'object',
    properties: {
      cannulas: {
        type: 'array',
        title: 'Cannula',
        items: {
          type: 'object',
          properties: {
            insDate: { type: 'string', format: 'date', title: 'Date of Insertion' },
            insTime: text('Time of Insertion'),
            insertedAt: { type: 'string', title: 'Inserted At', enum: ['Internal (This Facility)', 'External'] },
            insName: text('Inserted By — Name'),
            insEC: text('Inserted By — EC Code'),
            site: {
              type: 'string',
              title: 'Site',
              enum: ['Dorsum of Hand', 'Forearm', 'Antecubital Fossa', 'Wrist', 'Upper Arm', 'Other'],
            },
            side: { type: 'string', title: 'Side', enum: ['Left', 'Right'] },
            gauge: { type: 'string', title: 'Size of Cannula (Gauge)', enum: ['14G', '16G', '18G', '20G', '22G', '24G', '26G'] },
            days: {
              type: 'array',
              title: 'Day',
              items: {
                type: 'object',
                properties: {
                  dayDate: { type: 'string', format: 'date', title: 'Day & Date' },
                  shift: { type: 'string', title: 'Time (M/E/N)', enum: ['Morning', 'Evening', 'Night'] },
                  score: {
                    type: 'string',
                    title: 'VIP Score / Stage / Description',
                    enum: [
                      '0 — No sign of Phlebitis',
                      '1 — Possible first sign',
                      '2 — Early stage of phlebitis',
                      '3 — Medium stage of phlebitis',
                      '4 — Advanced / Thrombophlebitis',
                      '5 — Advanced Thrombophlebitis',
                    ],
                  },
                  response: { type: 'string', title: 'Intervention Done (Y/N)', enum: ['Yes', 'No'] },
                },
              },
            },
            remDate: { type: 'string', format: 'date', title: 'Date of Removal' },
            remReason: { type: 'string', title: 'Reason for Removal', enum: ['Course completed', 'Phlebitis / infection signs', 'No longer required', 'Other'] },
            inspName: text('Inspected By — Name'),
            leadName: text('Nurse Team Lead — Name'),
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
                instanceLabel: 'Cannula',
                addLabel: '+ Add Cannula',
                countLabel: '{n} cannula{s}',
                emptyLabel: 'No cannulas recorded yet. Click "Add Cannula" to begin.',
                removeConfirm: 'Remove this cannula record?',
                columns: [
                  { label: 'Date of Insertion', path: 'insDate' },
                  { label: 'Site', path: 'site' },
                  { label: 'Side', path: 'side' },
                  { label: 'Size of Cannula (Gauge)', path: 'gauge' },
                  { label: 'Days assessed', countOf: 'days', align: 'center' },
                ],
              },
            },
            detail: {
              type: 'OmfTabsLayout',
              elements: [
                {
                  type: 'Group',
                  label: 'Insertion',
                  elements: [
                    { type: 'HorizontalLayout', elements: [
                      { type: 'Control', scope: '#/properties/insDate' },
                      { type: 'Control', scope: '#/properties/insTime' },
                      { type: 'Control', scope: '#/properties/insertedAt' },
                    ]},
                    { type: 'HorizontalLayout', elements: [
                      { type: 'Control', scope: '#/properties/insName' },
                      { type: 'Control', scope: '#/properties/insEC' },
                    ]},
                  ],
                },
                {
                  type: 'Group',
                  label: 'Site & Device',
                  elements: [
                    { type: 'HorizontalLayout', elements: [
                      { type: 'Control', scope: '#/properties/site' },
                      { type: 'Control', scope: '#/properties/side' },
                      { type: 'Control', scope: '#/properties/gauge' },
                    ]},
                  ],
                },
                {
                  type: 'Group',
                  label: 'Daily VIP Assessment',
                  elements: [
                    {
                      // Nested repeating log INSIDE each cannula — the "+ Day"
                      // affordance on the paper chart.
                      type: 'Control',
                      scope: '#/properties/days',
                      options: {
                        omf: {
                          control: 'recordTable',
                          recordTable: {
                            addLabel: '+ Day',
                            countLabel: '{n} day{s} assessed',
                            emptyLabel: 'No daily assessments for this cannula yet.',
                            columns: [
                              { label: 'Day & Date', path: 'dayDate' },
                              { label: 'Time (M/E/N)', path: 'shift' },
                              { label: 'VIP Score', path: 'score' },
                              { label: 'Intervention Done', path: 'response' },
                            ],
                          },
                        },
                        detail: {
                          type: 'VerticalLayout',
                          elements: [
                            { type: 'Control', scope: '#/properties/dayDate' },
                            { type: 'Control', scope: '#/properties/shift' },
                            { type: 'Control', scope: '#/properties/score' },
                            { type: 'Control', scope: '#/properties/response' },
                          ],
                        },
                      },
                    },
                  ],
                },
                {
                  type: 'Group',
                  label: 'Removal & Sign-off',
                  elements: [
                    { type: 'HorizontalLayout', elements: [
                      { type: 'Control', scope: '#/properties/remDate' },
                      { type: 'Control', scope: '#/properties/remReason' },
                    ]},
                    { type: 'HorizontalLayout', elements: [
                      { type: 'Control', scope: '#/properties/inspName' },
                      { type: 'Control', scope: '#/properties/leadName' },
                    ]},
                  ],
                },
              ],
            },
          },
        },
      ],
    },
  },
  printSchema: { schemaVersion: '1.0', page: { size: 'A4', orientation: 'landscape' } },
} as unknown as FormDefinition;
