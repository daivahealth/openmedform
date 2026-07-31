/**
 * Mirrors the Sign-Off and After Care Checklist tables from a real HTML
 * mock-up: a <thead> of N columns with one cell per column per row. Exercises
 * OmfTableLayout's column mode (header row + per-cell alignment + suppressed
 * in-cell labels) against the two-cell left-label mode it falls back to.
 */
import type { FormDefinition } from '@openmedform/form-schema-types';

const text = { type: 'string' } as const;

export const signoffSample: FormDefinition = {
  id: 'signoff-sample',
  formCode: 'comfort-care',
  name: 'Comfort Care — table columns sample',
  version: '1',
  language: 'en',
  status: 'DRAFT',
  engine: 'jsonforms',
  dataSchema: {
    type: 'object',
    additionalProperties: false,
    properties: {
      signOff: {
        type: 'object',
        additionalProperties: false,
        properties: {
          doctorName: text, doctorSig: text,
          doctorDate: { type: 'string', format: 'date' },
          doctorTime: { type: 'string', format: 'time' },
          doctorFamily: text, doctorFamilySig: text,
          doctorFamilyAt: { type: 'string', format: 'date-time' },
          nurseName: text, nurseSig: text,
          nurseDate: { type: 'string', format: 'date' },
          nurseTime: { type: 'string', format: 'time' },
          nurseFamily: text, nurseFamilySig: text,
          nurseFamilyAt: { type: 'string', format: 'date-time' },
        },
      },
      aftercare: {
        type: 'object',
        additionalProperties: false,
        properties: {
          item1Status: { type: 'string', enum: ['Yes', 'No'] },
          item1At: { type: 'string', format: 'date-time' },
          item2Status: { type: 'string', enum: ['Yes', 'No'] },
          item2At: { type: 'string', format: 'date-time' },
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
          type: 'Group',
          label: 'Sign-Off',
          elements: [
            {
              type: 'OmfTableLayout',
              options: {
                omf: {
                  columns: [
                    { label: 'Role' }, { label: 'Name' }, { label: 'Signature' },
                    { label: 'Date' }, { label: 'Time' },
                    { label: 'Explained to — Family Member Name' },
                    { label: 'Signature' }, { label: 'Date & Time' },
                  ],
                },
              },
              elements: [
                {
                  type: 'OmfTableRow', label: 'Doctor',
                  elements: [
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorName' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorSig' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorDate' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorTime' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorFamily' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorFamilySig' },
                    { type: 'Control', scope: '#/properties/signOff/properties/doctorFamilyAt' },
                  ],
                },
                {
                  type: 'OmfTableRow', label: 'Nurse / Social Worker',
                  elements: [
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseName' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseSig' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseDate' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseTime' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseFamily' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseFamilySig' },
                    { type: 'Control', scope: '#/properties/signOff/properties/nurseFamilyAt' },
                  ],
                },
              ],
            },
          ],
        },
        {
          type: 'Group',
          label: 'After Care Checklist',
          elements: [
            {
              type: 'OmfTableLayout',
              options: {
                omf: {
                  columns: [
                    { label: '#', width: '40px', align: 'center' },
                    { label: 'Item' },
                    { label: 'Status', width: '150px' },
                    { label: 'Date & Time', width: '210px' },
                  ],
                },
              },
              elements: [
                {
                  type: 'OmfTableRow', label: '1',
                  elements: [
                    { type: 'Label', text: 'Ensure after care is discussed and organised' },
                    { type: 'Control', scope: '#/properties/aftercare/properties/item1Status' },
                    { type: 'Control', scope: '#/properties/aftercare/properties/item1At' },
                  ],
                },
                {
                  type: 'OmfTableRow', label: '2',
                  elements: [
                    { type: 'Label', text: 'Belongings are handed over to the family and it is documented' },
                    { type: 'Control', scope: '#/properties/aftercare/properties/item2Status' },
                    { type: 'Control', scope: '#/properties/aftercare/properties/item2At' },
                  ],
                },
              ],
            },
          ],
        },
      ],
    },
  } as never,
  printSchema: {
    schemaVersion: '1.0', pageSize: 'A4', orientation: 'portrait',
    marginsMm: { top: 12, right: 10, bottom: 12, left: 10 },
  },
  translations: { defaultLanguage: 'en', languages: ['en'], entries: {} },
  assets: [],
  audit: { createdAt: '', createdBy: '', updatedAt: '', updatedBy: '' },
};
