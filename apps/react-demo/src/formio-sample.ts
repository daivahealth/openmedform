import type { FormioFormDefinition } from '@openmedform/form-schema-types';

/**
 * A small Form.io-engine FormDefinition, used to prove the dispatcher still
 * renders legacy Form.io schemas unchanged alongside the new JSON Forms engine.
 */
export const formioSample: FormioFormDefinition = {
  id: 'demo-formio-0001',
  formCode: 'DEMO.FORMIO.1',
  name: 'Form.io Sample (legacy engine)',
  description: 'A minimal Form.io schema rendered through the preserved engine.',
  version: '1.0',
  language: 'en',
  status: 'PUBLISHED',
  engine: 'formio',
  schema: {
    display: 'form',
    components: [
      {
        type: 'textfield',
        key: 'patientName',
        label: 'Patient Name',
        input: true,
      },
      {
        type: 'number',
        key: 'heartRate',
        label: 'Heart Rate (bpm)',
        input: true,
      },
      {
        type: 'textarea',
        key: 'notes',
        label: 'Clinical Notes',
        input: true,
        rows: 3,
      },
      {
        type: 'button',
        key: 'submit',
        label: 'Submit',
        action: 'submit',
      },
    ],
  },
  audit: {
    createdAt: '2026-07-24T00:00:00.000Z',
    createdBy: 'demo',
    updatedAt: '2026-07-24T00:00:00.000Z',
    updatedBy: 'demo',
  },
};
