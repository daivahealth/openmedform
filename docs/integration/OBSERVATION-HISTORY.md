---
publish: true
description: "Show previous values, trends and flowsheets on OpenMedForm forms inside your EMR/EHR — React and Angular walkthroughs, storage and FHIR mapping, testing and troubleshooting."
---

# Observation History in your EMR/EHR

A clinical form is often filled **repeatedly for the same patient**: vitals every two hours, a pain
score each round, a pressure-injury check each shift. OpenMedForm's renderers can show the clinician
each field's **previous values** while they chart the new one, and draw a **flowsheet** of the day —
inside your application, from your data.

This guide takes you from an installed renderer to a working, populated history in React or Angular,
and covers how to store readings so they can be queried back, how a FHIR server answers the lookups,
and how to test it before you have real data. It assumes you have already done
[§1–§3 of the Third-Party Integration Guide](THIRD-PARTY-GUIDE.md) (download a form, install the
packages, render it).

```
   your EMR                                       @openmedform renderer
┌──────────────────────┐   history / provider   ┌──────────────────────────┐
│ earlier fills, or    │ ─────────────────────▶ │ aligns readings to the    │
│ your FHIR server     │                        │ current form by LOINC     │
│                      │ ◀───────────────────── │ chip · popover · trend    │
│ projectObservations()│   new readings to save │ <Flowsheet> · print       │
└──────────────────────┘                        └──────────────────────────┘
```

OpenMedForm never sees your patient data. Everything below runs in your frontend and your store.

## 1. What the clinician gets

| Surface | Where | What it shows |
|---|---|---|
| **Previous-value chip** | under a field, while filling | `Previous 88 /min · 2h ago · ↑ +6` — the last reading, its age, and the change against what is being typed |
| **Popover** | click the chip | the last *N* readings with clock time and author, and a sparkline for numeric fields |
| **Flowsheet** | a component you mount anywhere (a "Vitals" tab) | parameters down the left, one column per occurrence, newest first, sections from the form's groups |
| **Printed flowsheet** | `renderFlowsheetHtml()` | the same grid on A4 landscape |

Readings taken against an **older version** of the form, or on a **different form** that measures
the same thing, line up under the right field — see [§6](#6-how-readings-line-up).

## 2. Prerequisites

### Package versions

| Package | Minimum |
|---|---|
| `@openmedform/form-schema-types`, `form-core`, `react-form-renderer` | 1.11.0 |
| `@openmedform/angular-form-renderer` | 1.10.1 |
| `@openmedform/form-print-engine` (printing only) | 0.5.1 |

### The form must opt in

History is a property of the **form definition**, not of your code, so it behaves the same in every
host. In OpenMedForm's designer (or by editing the exported definition) the fields that should show
history carry:

```jsonc
{
  "type": "Control",
  "scope": "#/properties/obs/properties/heartRate",
  "options": {
    "omf": {
      "coding": [{ "system": "http://loinc.org", "code": "8867-4", "display": "Heart rate", "source": "human", "verified": true }],
      "unit": "/min",
      "history": { "show": "inline", "count": 5, "trend": true }
    }
  }
}
```

| Key | Purpose |
|---|---|
| `omf.history.show` | `'inline'` — chip under the field; `'popover'` — a small "History (n)" button only; absent — no history for this field |
| `omf.history.count` | how many prior readings to fetch and list (default 5) |
| `omf.history.trend` | draw a sparkline for numeric fields (default true) |
| `omf.coding` | LOINC/SNOMED binding — **the identity of the reading over time**. Bind every field you want to trend; the **Dictionary** panel in OpenMedForm suggests and verifies codes |
| `omf.unit` | UCUM code (`'mm[Hg]'`, `'Cel'`, `'%'`); shown as the clinical symbol, never converted |
| `omf.effectiveAt: true` | on a date/date-time field: this is when the readings were **taken** (see [§7](#7-time-the-effectiveat-rule)) |
| `omf.recordTable.effectiveAtPath` | on a repeating table: the field inside each row holding that row's time |

A field without `omf.history` renders exactly as before. A form with no history supplied renders
exactly as before.

## 3. Two ways to supply history — pick one or both

| | `history` (batch) | `historyProvider` (lazy) |
|---|---|---|
| **You pass** | the patient's earlier fills you already have in hand | a function the renderer calls once per history-enabled field |
| **Good when** | you load a patient's recent responses anyway; small forms; offline-first | you have an observation store or FHIR server; many fields; long histories |
| **Alignment** | done by the renderer from each fill's definition | done by your query (by code) — the renderer trusts what you return |
| **Patient identity** | never leaves your closure | never leaves your closure |

Both may be given. Provider results win over batch results at the same timestamp.

### The three types you will use

```ts
import type { HistoryEntry, HistoryProvider, Observation } from '@openmedform/form-schema-types';

// Batch: one earlier fill, as you stored it.
const entry: HistoryEntry = {
  effectiveAt: '2026-09-15T12:00:00Z',  // when TAKEN — ISO-8601
  data: response,                        // the onChange object you saved
  definition: definitionV2,              // the definition it was filled against — omit if same as now
  author: 'RN Priya',
};

// Lazy: the renderer asks per field.
const provider: HistoryProvider = async ({ coding, path, limit }) => {
  // coding?: [{ system, code, ... }]   — the field's bindings (prefer these)
  // path: 'obs.heartRate'              — index-free data path (only key for an unbound field)
  // limit: 5
  return observations; // Observation[], newest first
};

// One reading, FHIR-shaped. What the provider returns; what projectObservations() produces.
const reading: Observation = {
  path: 'obs.heartRate',
  coding: [{ system: 'http://loinc.org', code: '8867-4', source: 'human', verified: true }],
  label: 'Heart rate',
  value: 88,
  unit: '/min',
  effectiveAt: '2026-09-15T12:00:00Z',
  source: { author: 'RN Arun' },        // your bag; `author` and `superseded` are displayed
};
```

## 4. React

```tsx
import { useMemo } from 'react';
import { JsonFormsRenderer, Flowsheet } from '@openmedform/react-form-renderer';
import type { JsonFormsFormDefinition, HistoryEntry, HistoryProvider } from '@openmedform/form-schema-types';

interface Props {
  definition: JsonFormsFormDefinition;     // the downloaded bundle
  patientId: string;                       // YOUR identifier — the renderer never sees it
  priorFills: Array<{ observedAt: string; response: Record<string, unknown>; definition?: JsonFormsFormDefinition; nurse: string }>;
  data: Record<string, unknown>;
  onChange: (next: Record<string, unknown>) => void;
}

export function VitalsForm({ definition, patientId, priorFills, data, onChange }: Props) {
  // Batch: what you already loaded for this patient.
  const history = useMemo<HistoryEntry[]>(
    () => priorFills.map((f) => ({
      effectiveAt: f.observedAt,
      data: f.response,
      definition: f.definition,            // pass it when the fill was made against an older version
      author: f.nurse,
    })),
    [priorFills],
  );

  // Lazy: your store answers per field. Closes over the patient.
  const historyProvider = useMemo<HistoryProvider>(
    () => async ({ coding, path, limit }) =>
      myObservationStore.query({
        patientId,
        code: coding?.[0]?.code,
        system: coding?.[0]?.system,
        path: coding ? undefined : path,
        limit,
      }),
    [patientId],
  );

  return (
    <>
      <JsonFormsRenderer
        definition={definition}
        data={data}
        onChange={onChange}
        history={history}
        historyProvider={historyProvider}
      />

      {/* Same data, as a grid. Mount it wherever the chart belongs. */}
      <Flowsheet definition={definition} entries={history} title="Today's observations" />
    </>
  );
}
```

Keep `history` and `historyProvider` referentially stable (`useMemo`) — a new provider function on
every render re-fetches every field.

**`<Flowsheet>` props**

| Prop | Meaning |
|---|---|
| `definition` | the form the grid's rows come from (row order = form order) |
| `entries?` | `HistoryEntry[]` — projected against their own definitions |
| `observations?` | `Observation[]` — already-projected readings (e.g. from FHIR); may be combined with `entries` |
| `maxColumns?` | newest N columns |
| `includeEmptyRows?` | keep rows with no readings (a blank chart) |
| `title?`, `emptyLabel?` | text |
| `timeZone?` | IANA zone for the column clocks; default the viewer's |

`FieldHistory` is also exported for a custom control that wants the same chip:
`<FieldHistory path={path} uischema={uischema} value={data} label={label} />` inside your control's
frame, under the same `JsonFormsRenderer`.

## 5. Angular

```ts
import { Component, Input } from '@angular/core';
import { FlowsheetComponent, OmfFormComponent } from '@openmedform/angular-form-renderer';
import type { HistoryEntry, HistoryProvider, JsonFormsFormDefinition } from '@openmedform/form-schema-types';

@Component({
  selector: 'app-vitals-form',
  standalone: true,
  imports: [OmfFormComponent, FlowsheetComponent],
  template: `
    <omf-form
      [definition]="definition"
      [data]="data"
      (dataChange)="data = $event"
      [history]="history"
      [historyProvider]="historyProvider"
    ></omf-form>

    <omf-flowsheet [definition]="definition" [entries]="history" title="Today's observations"></omf-flowsheet>
  `,
})
export class VitalsFormComponent {
  @Input({ required: true }) definition!: JsonFormsFormDefinition;
  @Input({ required: true }) patientId!: string;
  data: Record<string, unknown> = {};

  history: HistoryEntry[] = [];
  historyProvider: HistoryProvider = async ({ coding, path, limit }) =>
    this.store.query({
      patientId: this.patientId,
      code: coding?.[0]?.code,
      system: coding?.[0]?.system,
      path: coding ? undefined : path,
      limit,
    });

  constructor(private readonly store: ObservationStore) {}

  ngOnInit() {
    // Batch: whatever you already load for the patient.
    this.history = this.store.recentFills(this.patientId).map((f) => ({
      effectiveAt: f.observedAt,
      data: f.response,
      definition: f.definition,
      author: f.nurse,
    }));
  }
}
```

Every value control (text, number, boolean, select, date, textarea, radio) carries the chip when its
field has `omf.history`. `<omf-flowsheet>` takes the same inputs as the React `Flowsheet` (§4). Two
`<omf-form>`s on one page keep separate histories: the scope is provided per form instance.

## 6. How readings line up

When a prior reading arrives, the renderer decides which field it belongs to by, in order:

1. **Same terminology binding** — `system` + `code` on the field and on the reading. Survives a
   field being renamed or moved between form versions, and lines up the same measurement taken on a
   *different* form (ward vitals vs ICU chart).
2. **Same index-free data path** — `vitals.pulse`; `hourly.2.hr` counts as `hourly.hr`. Works while an
   unbound field stays where it is; breaks the moment it moves.
3. Otherwise the reading is not shown. **Labels are never matched**: two "Temperature" fields in °C
   and °F are not one series.

The practical consequence: **a verified LOINC binding is what makes a field's history durable.**
Bind vitals and lab values in the Dictionary before you go live; the path fallback is a safety net,
not a plan.

**Units** are carried and shown, never converted. A prior reading in a different unit from the
current field shows with its unit and a warning glyph instead of a delta arrow; a flowsheet row that
mixes units shows the unit in every cell. Codes are UCUM in the data; on screen they appear as symbols
(`Cel` → `°C`, `mm[Hg]` → `mmHg`) — use `displayUnit()` from `form-core` in your own views for the
same reading.

## 7. Time: the `effectiveAt` rule

`effectiveAt` is when the readings were **taken**, never when the row was saved. The 14:00 round
charted at 14:20, or back-charted at 16:00, is still the 14:00 reading. Every chip age, sort order and
flowsheet column uses it. Get it from, in order of preference:

1. the clinician — a date/time field on the form flagged `omf.effectiveAt: true`, or your own
   "observed at" control;
2. your workflow — the scheduled round the fill belongs to;
3. the save time, as a last resort.

Always ISO-8601 with a zone (`2026-09-15T14:00:00+05:30` or `Z`). A local-time string without a zone
is parsed in the viewer's zone and will read "in 2h" for a viewer elsewhere.

## 8. Storing readings so they can be queried back

The response JSON is the record. The readings *inside* it are what history queries. At save time,
flatten one into the other with `projectObservations` and store the rows in whatever you already
have — a table, a document store, or your FHIR server.

```ts
import { projectObservations, toFhirObservation } from '@openmedform/form-core';

const rows = projectObservations(definition, response, {
  effectiveAt: observedAt,                                    // §7
  source: { formCode, formVersion, author: nurse.displayName }, // opaque to us; `author` is displayed
});

// Your table…
await db.observations.insertMany(rows.map((r) => ({ patientId, encounterId, ...r })));

// …or your FHIR server:
await fhir.transaction(
  rows.map((r) => toFhirObservation(r, {
    subject: { reference: `Patient/${patientId}` },
    encounter: { reference: `Encounter/${encounterId}` },
    performer: [{ display: nurse.displayName }],
  })),
);
```

One `Observation` row per scalar answer: a coded answer keeps its code plus the option's label and
binding, a multi-select yields one row per selected option, every row of a repeating table yields its
own set (with its own time when `effectiveAtPath` is set). Fields left blank produce nothing.

### A minimal table

| Column | From | Index |
|---|---|---|
| patient_id, encounter_id | your context | ✔ |
| path | `Observation.path` | ✔ with patient |
| code_system, code | `Observation.coding[0]` | ✔ with patient |
| value_num / value_text / value_bool, unit | `Observation.value`, `.unit` | |
| effective_at | `Observation.effectiveAt` | ✔ |
| row (JSON) | the whole `Observation` — return it to the renderer unchanged | |

Delete-then-insert by submission id when a response is corrected, so re-saves are idempotent.

### Corrections

Never overwrite a completed response to record a new reading; a completed response is a signed
clinical record. A correction is a **new** response; mark the old reading `source.superseded: true`
when you store it. Superseded readings are struck through in the flowsheet and excluded from trends.

## 9. Answering the provider from FHIR

`historyProvider` receives a `HistoryQuery`; against FHIR R4 the mapping is direct.

| `HistoryQuery` | FHIR `Observation` search |
|---|---|
| `coding[0]` | `code=http://loinc.org|8867-4` |
| `path` (unbound field only) | a local code system of your own, e.g. `code=http://your.emr/omf-path|obs.spo2` |
| `limit` | `_count=5` |
| — (yours) | `patient=Patient/123&_sort=-date` |

```ts
const historyProvider: HistoryProvider = async ({ coding, path, limit }) => {
  const code = coding?.[0]
    ? `${coding[0].system}|${coding[0].code}`
    : `http://your.emr/omf-path|${path}`;
  const bundle = await fhir.search('Observation', { patient: `Patient/${patientId}`, code, _sort: '-date', _count: limit });
  return bundle.entry.map((e) => fromFhir(e.resource));
};

function fromFhir(o: FhirObservation): Observation {
  return {
    path: o.code.coding?.find((c) => c.system === 'http://your.emr/omf-path')?.code ?? '',
    coding: o.code.coding?.filter((c) => c.system !== 'http://your.emr/omf-path')
      .map((c) => ({ system: c.system, code: c.code, display: c.display, source: 'human', verified: true })),
    label: o.code.text ?? '',
    value: o.valueQuantity?.value ?? o.valueBoolean ?? o.valueCodeableConcept?.coding?.[0]?.code ?? o.valueString ?? '',
    valueLabel: o.valueCodeableConcept?.text,
    unit: o.valueQuantity?.code,
    effectiveAt: o.effectiveDateTime,
    source: {
      author: o.performer?.[0]?.display,
      superseded: o.status === 'entered-in-error',
    },
  };
}
```

Field-by-field:

| FHIR `Observation` | `Observation` |
|---|---|
| `code.coding[]` / `code.text` | `coding` / `label` |
| `effectiveDateTime` | `effectiveAt` |
| `valueQuantity.value` / `.code` | `value` / `unit` |
| `valueCodeableConcept.coding[]` / `.text` | `valueCoding` / `valueLabel` (stored code in `value`) |
| `valueBoolean`, `valueString` | `value` |
| `performer[0].display` | `source.author` |
| `status: 'entered-in-error'`, or superseded by a later resource | `source.superseded: true` |

## 10. Test it before you have data

`form-core` ships a fixture: a q2h vitals form in **two versions** (heart rate renamed and moved
between them, temperature in °C then °F) and a shift of prior fills.

```ts
import { vitalsHistoryReference, vitalsHistoryV2, vitalsHistoryEntries } from '@openmedform/form-core';

<JsonFormsRenderer definition={vitalsHistoryReference} history={vitalsHistoryEntries()} />
```

You should see: chips under six fields reading "2h ago", "4h ago"; heart rate lined up from the v2
field called "Pulse" (by LOINC 8867-4); temperature showing a units warning; the AVPU radio with a
"History (3)" button. The same fixture drives both OpenMedForm demos (`apps/react-demo`,
`apps/angular-demo`), so you can compare against a known-good render.

## 11. Printing

```ts
import { renderFlowsheetHtml } from '@openmedform/form-print-engine';

const html = renderFlowsheetHtml(definition, {
  entries: history,                              // and/or observations
  title: 'Ward vitals',
  headerLines: [patient.displayName, `MRN ${patient.mrn}`, 'Ward 3B'],
  columnsPerPage: 12,                            // more columns continue on a new page
  timeZone: 'Asia/Kolkata',
  footer: `Printed ${new Date().toLocaleString()} by ${user.name}`,
});
```

A4 landscape by default; rasterize as in the
[Third-Party Guide §6](THIRD-PARTY-GUIDE.md#6-print--pdf-optional).

## 12. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| No chip anywhere | nothing supplied (`history` empty and no `historyProvider`), or the form has no `omf.history` | supply history; set `omf.history` on the fields in the definition |
| Chip on some fields only | only those fields carry `omf.history` | by design — add it to the others |
| "Previous values unavailable" | your provider rejected | check the network call; the field stays usable |
| A prior reading is missing after a form revision | the field moved and has no binding | bind it to LOINC/SNOMED (§6); the path fallback cannot follow a move |
| Two fields show the same history | both bound to the same code, or both at the same path | one code per concept |
| Age reads "in 2h" | `effectiveAt` had no time zone, or a future time | ISO-8601 with zone (§7) |
| `⚠︎ units` on the chip | prior reading in another unit | expected — never converted; fix the source data or the definition's `omf.unit` |
| Flowsheet shows a raw key instead of a label | reading from a field the current form no longer has | the reading keeps its own label; add the field back or accept the key |
| Provider called on every keystroke | a new function identity each render | memoize the provider (React `useMemo`; Angular class field) |

## Reference

| | React | Angular |
|---|---|---|
| Batch history | `history?: HistoryEntry[]` prop on `JsonFormsRenderer` / `FormRenderer` | `[history]` input on `<omf-form>` |
| Lazy history | `historyProvider?: HistoryProvider` | `[historyProvider]` |
| Flowsheet | `<Flowsheet definition entries? observations? maxColumns? includeEmptyRows? title? emptyLabel? timeZone? />` | `<omf-flowsheet>` with the same inputs |
| Chip in a custom control | `<FieldHistory path uischema value label />` | `<omf-field-history [path] [uischema] [value] [label]>` |

`form-core` functions you may call directly: `projectObservations`, `toFhirObservation`,
`alignHistory`, `buildFlowsheet`, `displayUnit`, `formatObservationValue`, `relativeAge`.

Related: [Third-Party Integration Guide](THIRD-PARTY-GUIDE.md) ·
[Clinical Terminology](../features/CLINICAL-TERMINOLOGY.md) ·
[Form Builder vocabulary](../features/FORM-BUILDER.md) ·
[ADR-005](../ADR/005-observation-history.md)
