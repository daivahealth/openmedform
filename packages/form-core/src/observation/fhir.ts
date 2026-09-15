/**
 * FHIR R4 `Observation` — a leaf convenience for hosts whose store is FHIR
 * (ADR-005). Our neutral `Observation` maps one-to-one; this writes the
 * resource shape so the host does not. `subject`, `encounter` and `performer`
 * are the host's to fill — nothing here knows a patient.
 *
 * Structural type, not a dependency on a FHIR package: the fields we emit,
 * typed loosely enough that a host can spread the result into its own typed
 * resource.
 */

import type { Observation, OmfCoding } from '@openmedform/form-schema-types';

export interface FhirCoding {
  system: string;
  code: string;
  display?: string;
}

export interface FhirCodeableConcept {
  coding?: FhirCoding[];
  text?: string;
}

export interface FhirQuantity {
  value: number;
  unit?: string;
  system?: 'http://unitsofmeasure.org';
  code?: string;
}

export interface FhirReference {
  reference?: string;
  display?: string;
}

export interface FhirObservation {
  resourceType: 'Observation';
  status: 'registered' | 'preliminary' | 'final' | 'amended' | 'corrected' | 'cancelled' | 'entered-in-error';
  code: FhirCodeableConcept;
  effectiveDateTime: string;
  subject?: FhirReference;
  encounter?: FhirReference;
  performer?: FhirReference[];
  valueQuantity?: FhirQuantity;
  valueString?: string;
  valueBoolean?: boolean;
  valueCodeableConcept?: FhirCodeableConcept;
  /** Where the value came from in the form: the data path and any host `source`. */
  note?: Array<{ text: string }>;
}

export interface ToFhirOptions {
  status?: FhirObservation['status'];
  subject?: FhirReference;
  encounter?: FhirReference;
  performer?: FhirReference[];
  /** Include a `note` with the data path and `source` (default false). */
  provenanceNote?: boolean;
}

function toFhirCoding(list: OmfCoding[] | undefined): FhirCoding[] | undefined {
  if (!list || list.length === 0) return undefined;
  return list.map((c) => ({
    system: c.system,
    code: c.code,
    ...(c.display ? { display: c.display } : {}),
  }));
}

/**
 * Build a FHIR R4 Observation from one projected observation.
 *
 * - numeric value → `valueQuantity` (UCUM `code` = our `unit` when present)
 * - boolean → `valueBoolean`
 * - coded answer (has `valueCoding`) → `valueCodeableConcept`
 * - anything else → `valueString`
 *
 * An unbound field still produces a valid resource: `code.text` carries the
 * label with no `coding`, which is what FHIR allows for local concepts.
 */
export function toFhirObservation(obs: Observation, opts: ToFhirOptions = {}): FhirObservation {
  const codeCoding = toFhirCoding(obs.coding);
  const out: FhirObservation = {
    resourceType: 'Observation',
    status: opts.status ?? 'final',
    code: { ...(codeCoding ? { coding: codeCoding } : {}), text: obs.label },
    effectiveDateTime: obs.effectiveAt,
    ...(opts.subject ? { subject: opts.subject } : {}),
    ...(opts.encounter ? { encounter: opts.encounter } : {}),
    ...(opts.performer ? { performer: opts.performer } : {}),
  };

  const valueCoding = toFhirCoding(obs.valueCoding);
  if (valueCoding) {
    out.valueCodeableConcept = { coding: valueCoding, text: obs.valueLabel ?? String(obs.value) };
  } else if (typeof obs.value === 'number') {
    out.valueQuantity = {
      value: obs.value,
      ...(obs.unit ? { unit: obs.unit, system: 'http://unitsofmeasure.org', code: obs.unit } : {}),
    };
  } else if (typeof obs.value === 'boolean') {
    out.valueBoolean = obs.value;
  } else if (obs.valueLabel) {
    // A coded answer without a terminology binding: keep the label readable.
    out.valueCodeableConcept = { text: obs.valueLabel };
  } else {
    out.valueString = String(obs.value);
  }

  if (opts.provenanceNote) {
    const parts = [`path=${obs.path}`];
    if (obs.source) parts.push(JSON.stringify(obs.source));
    out.note = [{ text: parts.join(' ') }];
  }

  return out;
}
