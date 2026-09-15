/**
 * Observation — one scalar clinical reading flattened out of a response, and
 * the contracts a host uses to hand PRIOR readings back to a renderer.
 *
 * Why this exists (ADR-005): forms are filled repeatedly for the same patient
 * (vitals every two hours, a pain score each round). Showing the previous
 * value beside the field, or a flowsheet across the day, needs two things the
 * raw response blob cannot give: a stable identity for "the same reading"
 * across form versions and across different forms, and a clinical timestamp.
 *
 * The identity is the field's terminology binding (`options.omf.coding`,
 * LOINC/SNOMED), falling back to its data path. The timestamp is `effectiveAt`
 * — when the reading was TAKEN, never when the row was written.
 *
 * In an EMR the platform holds no patient data, so every type here is
 * host-facing: the host projects its stored responses (or its own FHIR
 * Observations) into this shape and passes them in. Nothing carries a patient
 * identifier on purpose.
 *
 * The shape is deliberately close to FHIR R4 `Observation` so a host that
 * stores FHIR maps one-to-one (form-core ships `toFhirObservation`).
 */

import type { OmfCoding } from './ui-schema';
import type { FormDefinition } from './form-definition';

/** The scalar a single observation carries. Arrays are split into one row per element. */
export type ObservationValue = number | string | boolean;

export interface Observation {
  /**
   * Dotted data path of the value INSIDE the response it came from, indices
   * included for repeating groups: `vitals.systolic`, `treatments.2.dose`.
   * Provenance, and the fallback identity when a field carries no coding.
   */
  path: string;
  /**
   * The field's terminology bindings, copied from the definition it was filled
   * against. Empty/absent for an unbound field.
   */
  coding?: OmfCoding[];
  /**
   * For an enum answer: the bindings of the SELECTED option
   * (`options.omf.optionCoding[code]`). What a FHIR host puts in
   * `valueCodeableConcept`.
   */
  valueCoding?: OmfCoding[];
  /** Display label, resolved the way the renderer resolves it (dataSchema `title` first). */
  label: string;
  /** Nearest ancestor Group label at projection time, for grouping a flowsheet. */
  section?: string;
  value: ObservationValue;
  /** For an enum answer: the option's display label, so a flowsheet never shows a bare code. */
  valueLabel?: string;
  /** From `options.omf.unit` on the field. Never inferred, never converted. */
  unit?: string;
  /**
   * Clinical time of the reading, ISO-8601. Supplied by the caller (or read
   * from a per-record timestamp field for repeating groups). NOT a write time.
   */
  effectiveAt: string;
  /**
   * Free-form provenance the host may attach and read back: form code and
   * version, author, source system, an amendment marker. Opaque to form-core.
   */
  source?: Record<string, unknown>;
}

/** The two schemas projection and alignment actually read. A full FormDefinition satisfies it. */
export type FormDefinitionSchemas = Pick<FormDefinition, 'dataSchema' | 'uiSchema'>;

/**
 * One prior fill handed to a renderer in BATCH form: the response as the host
 * stored it, plus the definition it was filled against when that differs from
 * the one being rendered. The renderer projects and aligns it itself.
 */
export interface HistoryEntry {
  /** Clinical time of this fill, ISO-8601. */
  effectiveAt: string;
  data: Record<string, unknown>;
  /** Omit when identical to the definition being rendered. */
  definition?: FormDefinitionSchemas;
  author?: string;
  /** Passed through onto every projected Observation's `source`. */
  source?: Record<string, unknown>;
}

/** What a renderer asks a `HistoryProvider` for, per field. */
export interface HistoryQuery {
  /** The field's bindings; the preferred lookup key (`Observation?code=…` in FHIR terms). */
  coding?: OmfCoding[];
  /** Index-free data path of the field, the fallback key: `vitals.systolic`, `treatments.dose`. */
  path: string;
  /** How many prior values to return, newest first. */
  limit: number;
}

/**
 * LAZY history: the host answers per-field lookups. The host closes over the
 * patient identifier; the renderer never sees it. Results are merged with any
 * batch `HistoryEntry`s and win over them at the same `effectiveAt`.
 */
export type HistoryProvider = (query: HistoryQuery) => Promise<Observation[]>;
