---
publish: true
description: "Why observation history is switched on per section of a form, inherited by its fields, and how the builder exposes that."
---

# ADR-006: Section-level history — declared on a Group, inherited by its fields

## Status
Accepted (2026-09-15). Extends [ADR-005](005-observation-history.md). Workstreams 1–4 implemented (core, renderers, Dictionary panel + API, prompts); 5 pending.

## Context

ADR-005 made previous values and flowsheets work in every host, switched on by `omf.history` **on
each field**. That is the right unit for rendering, but the wrong unit for the decision a designer
makes. A clinician thinks "the Observations section is charted every two hours", not "heart rate,
respiratory rate, systolic, diastolic, temperature and SpO2 each show history". Today that thought
has to be expressed six times, and the builder offers no control for it at all: the only ways to set
it are a refine-chat instruction the prompts have not been taught, or editing the exported JSON.

Three properties of the platform shape the answer:

- The definition already cascades behaviour from sections to fields: a `rule` on a Group hides its
  children; `accentColor`, `icon` and scoring subtotals live on the Group. Designers know the pattern.
- The **Dictionary panel** already lists every field grouped by section and writes per-field clinical
  metadata by a click (terminology bindings, `PATCH /forms/:id/coding`). History belongs beside the
  binding that makes it durable, and the panel already draws the section headers a section control
  would hang off.
- The renderers read a field's `omf.history` off its own UI element. A JSON Forms control does not
  know its ancestor Group, so inheritance cannot be resolved inside the control; it has to be
  resolved once, from the definition, and handed down — the shape `HistoryScope` (React) and
  `HistoryScopeService` (Angular) already have.

A form-level declaration ("this form is serial") was considered. It is the right hook for a future
scheduling feature, but it over-reaches for history: a form often mixes a repeated observations
section with one-off sections (admission details, consent), and the form-level switch would need a
section-level off-switch anyway. The section is the natural grain; a form-level default can be added
later as one more level of the same cascade without changing anything decided here.

## Decision

### 1. `omf.history` is allowed on a Group and inherited

`OmfHistoryOptions` may sit on a `Group` (and on the `Omf*` section layouts that behave as groups).
Every Control beneath it inherits the setting unless something closer overrides it:

```
field  ▸  nearest enclosing Group  ▸  outer Groups …  ▸  none
```

- A field with its own `omf.history` wins, including `{ show: 'none' }` to opt a single field out of
  a section that has history on.
- Inheritance applies to fields that can carry a scalar reading (number, integer, string, boolean,
  enum, date). Layout-only elements and display controls (`scoreSummary`, `clinicalReferenceTable`,
  `Label`) never show history.
- `count` and `trend` inherit with `show`. `unit` does **not** inherit — it is a property of the
  measurement, set per field (usually by conversion or in the Dictionary).
- `recordTable`: `history` on the table's Group applies to the fields inside each record.

### 2. form-core resolves the cascade once

```ts
/** Effective history config per field key (index-free data path), after inheritance. */
export function resolveHistoryConfig(definition: FormDefinitionSchemas): Map<string, OmfHistoryOptions>;
```

`collectHistoryFields` gains `history?: OmfHistoryOptions` (the resolved value) and both renderers'
scopes carry the map. `useFieldHistory` / `FieldHistoryComponent` look their key up in the map
instead of reading the raw element, so a section-level setting reaches every control with no change
to the controls themselves. Host behaviour is unchanged: nothing shows unless the host supplies
history, and a field-level `omf.history` behaves exactly as in ADR-005.

### 3. The builder exposes it in the Dictionary panel

The Dictionary panel becomes the place where a designer decides history, next to the bindings:

- **Per section header:** a "Previous values" control — Inline · Popover · Off · (inherit) — writing
  `omf.history` on that Group.
- **Per field row:** the same control showing the *effective* value, greyed when inherited, editable
  to override; plus a unit box for numeric fields.
- **A warning** on any field whose effective history is on and whose binding is not verified, because
  that field's history will break on the next revision (ADR-005 §"matching rule").

Sections need a stable identity to write to. Groups have no `scope`, so `collectCodedItems` gains
`sectionPointer` — the JSON pointer of the nearest Group in the layout (`/elements/0`), the same
addressing the refine chat's patches use.

The coding endpoint generalises into a per-target metadata write:

```
PATCH /api/forms/:id/field-meta
{ target: { scope } | { pointer }, history?: OmfHistoryOptions | null, unit?: string | null }
```

Same rules as `PATCH /coding`: DRAFT/REVIEW versions only, audited (`form.field-meta.update`),
tenant-scoped. `PATCH /coding` stays as is.

### 4. The AI learns the vocabulary

The conversion prompt and the refine prompt gain `history` (with the Group-first guidance: "set it on
the section, not on each field"), `unit`, and `effectiveAt`. Conversion sets `history` on a section
when the source is plainly a serial observation sheet (a time-column grid, "q2h", "each shift",
hourly rows). Refine handles "show previous values on the Observations section" as one patch.

## Consequences

**Easier**

- One click, or one sentence, turns history on for a whole section; a field can still opt out.
- The decision is visible and auditable in the same panel as the binding it depends on.
- Hosts and the API change nothing; the definition still carries the answer.

**Harder / accepted costs**

- Inheritance is a second thing to explain: the Dictionary shows the effective value and where it
  came from, so a greyed "inherited from Observations" row answers the question before it is asked.
- Renderers must consume the resolved map rather than the raw element. Both already have the scope
  object to carry it; the source-guard tests in Angular pin the parity.
- `sectionPointer` ties the Dictionary's section write to layout position. Refine-chat edits that
  move a Group invalidate the pointer for the duration of the edit only; the panel re-reads the
  definition after every write.

## Implementation plan

One PR per workstream, each targeting `main`, packages with changesets.

1. **Vocabulary + core** — `OmfHistoryOptions` allowed on Group (types), `resolveHistoryConfig`,
   `collectHistoryFields.history`, `collectCodedItems.sectionPointer`; tests for the cascade
   (section on, field off, nested groups, recordTable).
2. **Renderers** — React `HistoryScope` and Angular `HistoryScopeService` carry the resolved map;
   `useFieldHistory` / `FieldHistoryComponent` read it. Mounted React test: history on the Group, chip
   on every numeric field, none on the opted-out one. Angular source guards.
3. **Builder** — Dictionary panel section and field controls with the inherited/override state and
   the unverified-binding warning; `PATCH /forms/:id/field-meta` with audit; API docs.
4. **Prompts** — conversion and refine vocabulary; the pinned prompt tests.
5. **Docs** — Form Builder vocabulary (Group row), Clinical Terminology (the panel), the Observation
   History integration guide (a "which fields" section), this ADR to Accepted.
