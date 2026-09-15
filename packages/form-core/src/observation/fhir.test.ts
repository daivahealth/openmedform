import { describe, expect, it } from 'vitest';

import { toFhirObservation } from './fhir';
import { projectObservations } from './project';
import { VITALS_V2 } from './fixtures.test-helpers';

const AT = '2026-09-15T14:00:00Z';
const rows = projectObservations(
  VITALS_V2,
  { vitals: { pulse: 88, spo2: 97, avpu: 'ALERT', onOxygen: true }, notes: 'ok' },
  { effectiveAt: AT, source: { formCode: 'VITALS' } },
);
const row = (path: string) => rows.find((r) => r.path === path)!;

describe('toFhirObservation', () => {
  it('maps a bound numeric field to valueQuantity with UCUM', () => {
    expect(toFhirObservation(row('vitals.pulse'))).toEqual({
      resourceType: 'Observation',
      status: 'final',
      code: { coding: [{ system: 'http://loinc.org', code: '8867-4', display: 'Heart rate' }], text: 'Pulse' },
      effectiveDateTime: AT,
      valueQuantity: { value: 88, unit: '/min', system: 'http://unitsofmeasure.org', code: '/min' },
    });
  });

  it('keeps an unbound field valid with code.text only', () => {
    const out = toFhirObservation(row('vitals.spo2'));
    expect(out.code).toEqual({ text: 'SpO2' });
    expect(out.valueQuantity?.value).toBe(97);
  });

  it('maps a coded answer to valueCodeableConcept', () => {
    expect(toFhirObservation(row('vitals.avpu')).valueCodeableConcept).toEqual({
      coding: [{ system: 'http://snomed.info/sct', code: '248234008', display: 'Mentally alert' }],
      text: 'Alert',
    });
  });

  it('maps booleans and strings', () => {
    expect(toFhirObservation(row('vitals.onOxygen')).valueBoolean).toBe(true);
    expect(toFhirObservation(row('notes')).valueString).toBe('ok');
  });

  it('leaves subject/encounter/performer to the host, and can carry provenance as a note', () => {
    const out = toFhirObservation(row('vitals.pulse'), {
      status: 'amended',
      subject: { reference: 'Patient/123' },
      provenanceNote: true,
    });
    expect(out.status).toBe('amended');
    expect(out.subject).toEqual({ reference: 'Patient/123' });
    expect(out.note).toEqual([{ text: 'path=vitals.pulse {"formCode":"VITALS"}' }]);
    expect(toFhirObservation(row('vitals.pulse')).subject).toBeUndefined();
  });
});
