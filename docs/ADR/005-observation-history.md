---
publish: false
---

# ADR-005: Observation history — projecting, aligning and displaying repeated fills

## Status
Accepted (2026-09-15). Workstreams 1–2 implemented; 3–7 pending.

## Context

Clinical forms are often filled **repeatedly for the same patient**: vitals every two hours, a
pain score each round, a pressure-injury check each shift. Clinicians need to see the previous
values while charting the new ones, and to see a trend or flowsheet across the day.

Three facts about OpenMedForm shape how this must be built:

1. **In an EMR/EHR the platform holds no patient data.** Per
   [EMR-INTEGRATION](../features/EMR-INTEGRATION.md) and the
   [Third-Party Integration Guide](../integration/THIRD-PARTY-GUIDE.md), the host application
   renders the form with `@openmedform/react-form-renderer` or `@openmedform/angular-form-renderer`
   and stores responses in **its own** database. Nothing on our side can answer "what was this
   patient's last BP". History must flow from the host into the renderer, so the whole feature has
   to ship as **library code** in the npm packages, with no dependency on the OpenMedForm API.

2. **Storage is not the hard problem; alignment is.** Twelve response blobs saved over a shift may
   have been filled against different versions of the template (a field renamed, moved into a
   section), or against a different form altogether (ward vitals vs ICU observation chart). To draw
   one BP series, something has to know that `#/properties/vitals/properties/systolicBp` in v2 is the
   same reading as `#/properties/bp/properties/sys` in v3. If each host solves this itself, each one
   solves it differently and some solve it wrong.

3. **We already have the identity we need.** `OmfCoding` (`options.omf.coding` on a Control, see
   [CLINICAL-TERMINOLOGY](../features/CLINICAL-TERMINOLOGY.md)) binds fields to LOINC/SNOMED, rides
   inside the immutable published definition, and was introduced precisely for
   "cross-form queries by LOINC/SNOMED code". `collectCodedItems()` in `form-core` already walks a
   definition and yields every bindable item with its codings.

Two other properties of the platform constrain the answer:

- Published versions are immutable and every response is pinned to its `form_version_id`
  (CLAUDE.md Form Engine Rules). A completed response must never be edited in place; corrections are
  `AMENDED`. History therefore means **one response per occurrence**, not one response updated twelve
  times.
- Custom behaviour must exist in **both** renderers with shared logic in `form-core`.

### What "history" is, and is not

Three record shapes exist. They are complementary, and the UI should make them look the same:

| Shape | When | Storage |
|---|---|---|
| **One response per occurrence** | Scheduled/serial fills (q2h vitals, per-round pain score). Each is a distinct, separately signed clinical record. **Default.** | N responses |
| **One response with a repeating group** | The chart itself is the artifact, signed once (24-h ICU observation sheet, fluid balance). Already supported by `recordTable` with `orientation: 'columns'`. | 1 response, array inside |
| **Update in place** | Only an `IN_PROGRESS` draft. Never after completion. | — |

Scheduling (a missed 16:00 round has no response, so absence cannot be derived from responses) is a
separate concern owned by the host or by a future OpenMedForm task model. It is **out of scope** for
this ADR.

## Decision

### 1. `form-core` owns projection and alignment

Two framework-independent functions, built on the existing `collectCodedItems()` walk:

```ts
/** One scalar reading, flattened out of a response. Deliberately FHIR-Observation-shaped. */
export interface Observation {
  /** JSON pointer of the value in the response — provenance and the fallback identity. */
  path: string;
  /** Terminology binding from the definition, if the field has one. */
  coding?: OmfCoding[];
  /** Display label, resolved the way the renderer resolves it (dataSchema title first). */
  label: string;
  value: number | string | boolean;
  /** From `options.omf.unit` on the field (UCUM); never inferred. */
  unit?: string;
  /** Clinical time of the reading — NOT the time the row was written. Supplied by the caller. */
  effectiveAt: string;
  /** Free-form provenance the host may attach (form code/version, author, source). */
  source?: Record<string, unknown>;
}

/**
 * Flatten one response into observations. Scalars become one row each; a
 * coded answer keeps its code plus the option label and `optionCoding`; a
 * multi-select yields one row per selected option; every element of a
 * `recordTable` array becomes its own set of rows, timestamped from
 * `recordTable.effectiveAtPath` when the definition names one, else `effectiveAt`.
 */
export function projectObservations(
  definition: FormDefinitionSchemas, // Pick<FormDefinition, 'dataSchema' | 'uiSchema'>
  data: Record<string, unknown>,
  ctx: { effectiveAt: string; source?: Record<string, unknown> },
): Observation[];

/**
 * For each Control in `definition` (including those inside a recordTable's
 * detail layout), the prior observations that belong to it, newest first.
 * Keyed by INDEX-FREE data path (`treatments.dose`), not scope: detail
 * controls carry scopes relative to their record, which would collide.
 * This is the ONLY place the matching rule lives.
 */
export function alignHistory(
  definition: FormDefinitionSchemas,
  history: Observation[],
): Map<string /* index-free data path */, Observation[]>;

/** Batch form: project each prior fill against its own definition, then align. */
export function alignHistoryEntries(definition, entries: HistoryEntry[]): Map<string, Observation[]>;
/** Provider results win over batch results at the same effectiveAt. */
export function mergeHistory(batch: Observation[], fetched: Observation[]): Observation[];

/** Convenience for hosts that store FHIR. `subject`/`encounter` are left for the host. */
export function toFhirObservation(obs: Observation, opts?: { status?, subject?, encounter?, performer?, provenanceNote? }): FhirObservation;
```

**Matching rule** (in `alignHistory`), in strict order:

1. Same `coding.system` + `coding.code` on any binding of the field — works across versions and
   across forms. This is the path we want customers on.
2. Else same `path` — works across versions of the same form while a field is unbound, breaks the
   moment the field moves.
3. Else no history for that field.

**Never match by label.** Two fields called "Temperature" in °C and °F are not the same series.
Units are carried, displayed and never silently converted; a mismatch between matched values is
shown as two values with their units.

### 2. The renderers accept history from the host, two ways

Both `FormRenderer` (React) and the Angular renderer gain:

```ts
/** Batch: prior fills the host already has in hand. The renderer projects and aligns them. */
history?: Array<{
  effectiveAt: string;
  data: Record<string, unknown>;
  /** The definition that fill was made against; omit when identical to `definition`. */
  definition?: FormDefinition;
  author?: string;
}>;

/**
 * Lazy: per-field lookup, called when a field with history enabled mounts (or on demand).
 * The host closes over the patient identifier; the renderer never sees it.
 * Maps directly onto `GET Observation?patient=…&code=…&_sort=-date&_count=…`.
 */
historyProvider?: (q: {
  coding?: OmfCoding[];
  path: string;
  limit: number;
}) => Promise<Observation[]>;
```

Both may be supplied; provider results are merged with (and win over) batch results for the same
`effectiveAt`. The renderer stays a pure function of its props: no fetching, no patient identity,
no storage.

### 3. The designer decides which fields show history

New `omf` vocabulary. On a Control:

```ts
/** UCUM unit of a numeric field, carried onto every projected observation. */
unit?: string;
history?: {
  /** 'inline' — chip under the control; 'popover' — on demand only; 'none' (default). */
  show: 'inline' | 'popover' | 'none';
  /** How many prior values to request/display. Default 5. */
  count?: number;
  /** Draw a sparkline for numeric fields. Default true. */
  trend?: boolean;
};
```

On a `recordTable`: `effectiveAtPath` — the dot path inside one record to its clinical time.

It rides in the exported definition, so BP shows a chip in every host while "Patient position" never
does, with no per-host configuration.

### 4. Two display surfaces, identical in both renderers

- **Inline previous value.** Under the control: `Previous 138/86 · 2h ago · ↑`. Delta arrow only for
  numeric fields. Click/tap opens a popover listing the last *N* with author and time, plus a
  sparkline drawn against the field's `bands` when present. This is the highest-value piece: it puts
  the last reading in front of the clinician at the moment of charting.
- **`<Flowsheet>` component.** Standalone, host-mountable. Rows are the definition's Controls in
  `uiSchema` order (grouped by section), one column per `effectiveAt`, newest first. Amended values
  render struck through beside their correction. Because it uses `alignHistory`, a flowsheet built
  from twelve separate responses and one built from a single `recordTable`-column form are visually
  identical.

Both surfaces read only `--omf-*` design tokens.

### 5. The OpenMedForm app is just another host

The web app's fill screen passes a `historyProvider` backed by a new API read model:

- `Submission.effectiveAt` (defaults to `createdAt`; a definition may name a date/time field to
  drive it). Every history sort uses `effectiveAt`.
- An `Observation` table, populated in `SubmissionService.complete()` via the same
  `projectObservations` (delete-by-submission then insert; fully rebuildable by a backfill script).
  Tenant-scoped, Prisma-only, indexed on `(tenant_id, patient_mrn, code, effective_at)`.
- `GET /patients/:mrn/observations?code=&path=&limit=` and
  `GET /patients/:mrn/flowsheet?formId=&from=&to=` with the same RBAC as submission reads.

Details land in [DATA-MODEL](../architecture/DATA-MODEL.md) and [docs/api](../api/README.md) with
the implementing PR. The point of recording it here is the constraint: the app must not grow an
in-app-only history path that integrators do not get.

## Consequences

**Easier**

- Any EMR gets previous-value and flowsheet display by passing data it already has; the alignment
  logic is ours, so it is the same in every host and in our app.
- Storing `projectObservations()` output (or its FHIR form) at save time gives hosts a codified
  observation store with no mapping work, and turns terminology bindings into a visible payoff.
- The React/Angular/API/print surfaces share one walker, honouring the "shared logic in form-core"
  rule.

**Harder / accepted costs**

- Fields without a verified LOINC/SNOMED binding get fragile, path-only history. Guidance and the
  dictionary UI must push vital-sign fields toward verified bindings.
- Unit disagreement across forms is surfaced, not resolved. A UCUM-lite conversion table for common
  vital-sign units is a possible follow-up, not part of this decision.
- `historyProvider` adds an async path to renderers that were synchronous; loading and error states
  must be handled without blocking input.
- The FHIR helper couples us lightly to R4 shapes. It is a leaf convenience, so R5 can be added
  beside it.
- Scheduling / missed-round detection is explicitly not solved here.

## Implementation plan

Each workstream is one PR targeting `main` (1 and 2 shipped together: types without a consumer
have nothing to test). Package PRs carry a changeset.

1. **Contracts** — `form-schema-types`: `Observation`, `OmfHistoryOptions`, renderer prop types.
   Docs: FORM-BUILDER `omf` vocabulary table.
2. **Core** — `form-core`: `projectObservations`, `alignHistory`, `toFhirObservation`, sparkline data
   prep (`bucketTrend`), tests against the RRT/SBAR fixture plus a multi-version vitals fixture.
3. **React renderer** — `history` / `historyProvider` props, inline chip + popover, `<Flowsheet>`.
4. **Angular renderer** — parity with 3.
5. **Integration docs** — EMR-INTEGRATION and THIRD-PARTY-GUIDE: new "History & flowsheets" section
   with the FHIR `Observation` query mapping. Both are `publish: true`; wording stays free of
   internal detail.
6. **API + web** — `effectiveAt`, `Observation` table + migration, projection on complete, backfill
   script, the two read endpoints, `historyProvider` wiring in the fill screen. Docs: DATA-MODEL,
   docs/api, AUTH-AND-RBAC if scopes change.
7. **Print (optional)** — flowsheet page in `form-print-engine`.

Workstreams 1–5 have no backend dependency and deliver the EMR-embedded use case on their own;
6 can follow independently.
