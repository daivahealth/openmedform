# @openmedform/form-core

## 1.11.0

### Minor Changes

- e64b193: Units read like a chart, not like a code table. `form-core` gains
  `displayUnit(ucum)` — `Cel` → `°C`, `[degF]` → `°F`, `mm[Hg]` → `mmHg`,
  `10*9/L` → `×10⁹/L`, and the other common vital-sign and lab units; an unknown
  code passes through unchanged. `formatObservationValue` uses it, so the
  previous-value chip, both `Flowsheet` components and `renderFlowsheetHtml`
  all show symbols. The stored `omf.unit` and the `Observation.unit` on the wire
  stay UCUM, which is what FHIR wants.

### Patch Changes

- @openmedform/form-schema-types@1.11.0

## 1.10.0

### Minor Changes

- 048e627: Observation history, part 3 of ADR-005: the Angular renderer reaches parity
  with React.

  `<omf-form>` accepts `[history]` (prior fills as the host stored them, each
  optionally with the definition it was filled against) and `[historyProvider]`
  (a lazy per-field lookup the host implements — it closes over the patient, the
  renderer never sees an identifier). Every value control whose definition
  carries `omf.history` gets the same chip as in React — "Previous 84 /min · 2h
  ago · ↑ +6" — with a popover of the last N readings, author and a sparkline.
  New `<omf-flowsheet>` draws the same grid as the React `Flowsheet`. Both are
  thin views over form-core's shared model, so the two frameworks cannot
  disagree about a previous reading.

  `form-core` exports a `vitalsHistoryReference` / `vitalsHistoryV2` /
  `vitalsHistoryEntries()` fixture — a q2h vitals form in two versions with a
  shift of prior fills — used by both demos and useful for testing a host
  integration.

- 9e8027f: `renderFlowsheetHtml(definition, { entries | observations, … })` prints a
  patient's readings across time — parameters down the left, one column per
  occurrence, newest first — as a self-contained A4 landscape HTML document
  (ADR-005). It draws the same form-core `buildFlowsheet` grid the React and
  Angular `Flowsheet` components draw, so paper and screen agree: readings taken
  against an older version of the form line up by LOINC/SNOMED binding, a row
  that mixes units shows the unit in every cell, coded answers print their
  labels, superseded readings are struck through. Wide sheets continue on a new
  page after `columnsPerPage` (default 12) with the parameter spine repeated;
  `headerLines` and `footer` are the host's to fill.

  `form-core`: `collectHistoryFields` now resolves each field's display label
  (element label, schema title, then key), and `buildFlowsheet` uses it, so a
  blank chart printed to be filled by hand reads like the form rather than
  showing raw keys.

- b77b0d3: Observation history, part 2 of ADR-005: the React renderer shows a field's
  PRIOR values when the host supplies them.

  `FormRenderer` / `JsonFormsRenderer` accept `history` (prior fills as the host
  stored them, each optionally with the definition it was filled against) and
  `historyProvider` (a lazy per-field lookup the host implements — it closes over
  the patient, the renderer never sees an identifier). A Control whose definition
  carries `omf.history` gets a chip under it — "Previous 84 /min · 2h ago · ↑ +6"
  — that opens a popover with the last N readings (clock, author) and a sparkline
  for numeric fields. Alignment is by LOINC/SNOMED binding first, so readings
  taken against an older version of the form, or a different form, line up under
  the right field. A unit change between readings is flagged, never converted.
  Fields without `omf.history`, and forms with no host history, render exactly as
  before.

  New `<Flowsheet definition entries|observations />`: parameters down the left,
  one column per occurrence across the top, newest first, sections from the
  form's Groups, superseded readings struck through. `FieldHistory` is exported
  for custom controls that want the same chip.

  `form-core` gains the shared model behind both: `buildFlowsheet` (the grid),
  `formatObservationValue`, `relativeAge`, `formatClock` / `formatDay`, and the
  `source.author` / `source.superseded` conventions. The Angular renderer will
  render the same model; it follows in its own release.

- 35e9ed6: Observation history, part 1 of ADR-005: the contracts and the core logic that
  let a host show a field's PRIOR values (previous-value chip, trend, flowsheet)
  when a form is filled repeatedly for one patient — including inside an EMR,
  where OpenMedForm holds no patient data and the host supplies the history.

  `form-schema-types` gains `Observation` (one scalar reading, FHIR-shaped, with
  its terminology binding and a clinical `effectiveAt`), `HistoryEntry`,
  `HistoryQuery` and `HistoryProvider` (the batch and lazy shapes a renderer will
  accept), and three `omf` keys: `unit` (UCUM string on a numeric field),
  `history` (`{ show, count, trend }` — the designer decides which fields show
  history) and `recordTable.effectiveAtPath` (a per-record timestamp field, so
  an hourly chart signed once still trends by the hour).

  `form-core` gains `projectObservations` (flatten a response into observations —
  scalars, coded answers with their option binding, one row per multi-select
  option, every record of a `recordTable`), `alignHistory` /
  `alignHistoryEntries` (which prior observations belong to which field of the
  current definition: by LOINC/SNOMED code first, so a series survives a rename,
  a move or a different form; by index-free data path second; never by label),
  `mergeHistory`, trend prep (`trendPoints`, `latestDelta` with a unit-mismatch
  flag instead of a silent conversion, `hasMixedUnits`) and `toFhirObservation`
  for hosts whose store is FHIR R4. No renderer changes yet; those follow.

### Patch Changes

- Updated dependencies [788971a]
- Updated dependencies [35e9ed6]
  - @openmedform/form-schema-types@1.10.0

## 1.9.0

### Minor Changes

- 170a360: `omf.accentColor` on a `Label` now renders it as a **callout** — bordered, bold
  and washed with a tint of the accent — instead of plain body text. That is the
  banner a paper form puts around a result, an alert or a warning ("Overall
  result: CAM-ICU POSITIVE"), which previously converted to an unstyled paragraph
  indistinguishable from a footnote.

  Same key that already colours a `Group`, so there is no new vocabulary, and a
  `Label` without an accent is unchanged — existing instruction blocks are not
  affected.

  form-core gains `parseHexColor`, `accentTint` and `accentTintOpaque`. The wash
  is colour maths that all three surfaces need, and a result banner rendering in
  visibly different colours across React, Angular and print is exactly the drift
  the cross-renderer contract forbids. Print uses the opaque variant, mixed
  against white, because print pipelines routinely drop alpha compositing and a
  callout whose background vanishes takes its meaning with it. An accent the maths
  cannot read (a CSS variable, a named colour) still paints the border and text;
  only the wash is skipped.

### Patch Changes

- Updated dependencies [170a360]
  - @openmedform/form-schema-types@1.9.0

## 1.8.0

### Minor Changes

- 2ce0d73: `omf.bands` now works on a scored `Group`, not only on a `scoreSummary` control.
  The section's own subtotal picks the matching band and both renderers draw it as
  a verdict chip beside `Σ n` — a Sepsis sheet shows "Σ 2 Positive" on qSOFA and
  its own independent verdict on SIRS.

  This is what a sheet carrying several instruments needs. `scoreSummary`
  stratifies the WHOLE form's total, so with qSOFA (out of 3, positive at ≥ 2) and
  SIRS (out of 4, positive at ≥ 2) side by side it would add them into a number
  that means nothing clinically. Bands on a section without them are unchanged:
  the chip stays the bare number.

  The print engine gained the same reading — a filled sheet's legend prints
  `qSOFA (1 pt each) · Σ 2 — Positive`. A blank sheet prints neither, because
  "Σ 0 — Negative" beside a box nobody has answered is a wrong clinical reading
  rather than a neutral placeholder.

### Patch Changes

- Updated dependencies [2ce0d73]
  - @openmedform/form-schema-types@1.8.0

## 1.7.1

### Patch Changes

- a8cf9c1: Documented and pinned root-scope conditions. A rule condition whose `scope` is
  `#` resolves to the whole response rather than one field, so its `schema` can
  combine several answers with ordinary JSON Schema — `properties` + `required`
  for AND, `anyOf` for OR. That is what a derived clinical outcome needs
  ("POSITIVE only if Feature 1 AND Feature 2 AND (Feature 3 OR Feature 4)"),
  expressed as one `Label` per outcome and evaluated by the same deterministic
  `form-core` code as every other rule — no expression language, no `eval`.

  This already worked; nothing in the engine changed. It is now covered by tests
  in form-core and the React renderer so it cannot regress, and documented in
  FORM-BUILDER.md, because conversion now emits it for mock-ups that compute a
  result banner in JavaScript.

- Updated dependencies [a8cf9c1]
  - @openmedform/form-schema-types@1.7.1

## 1.7.0

### Minor Changes

- e2c8624: The automatic "Σ n" section subtotal chip is now drawn on the INNERMOST scoring
  section only. Summing every scored descendant put a total on every ancestor too
  — a Sepsis sheet whose qSOFA and SIRS boxes each score out of 3 and 4 also grew
  a `Σ 0` on the box around them and another on the whole screening section,
  neither of which the paper form totals. Both renderers now share form-core's new
  `showsSectionSubtotal()`, and the new `omf.showSectionTotal` puts the chip back
  on an outer Group whose combined total the source really does print
  (`omf.hideSectionTotal` still removes one). Scoring is unchanged either way:
  every item still feeds the grand total and the per-section breakdown.

### Patch Changes

- Updated dependencies [e2c8624]
  - @openmedform/form-schema-types@1.7.0

## 1.6.0

### Minor Changes

- 1264a03: **Licensing is now Apache-2.0 across every package, matching the repository's
  `LICENSE` file.**

  Five packages (`form-schema-types`, `form-core`, `form-design-tokens`,
  `react-form-renderer`, `angular-form-renderer`) declared `MIT` in their
  `package.json` while the only licence text in the repository — the one a
  consumer actually finds — has always been Apache-2.0. That was wrong metadata
  rather than a second grant, and it is corrected here; `form-print-engine` and
  the applications already declared Apache-2.0.

  Every published package now also ships the full `LICENSE` text in its tarball,
  so the terms travel with the package instead of only living in the repository.

  Versions already on npm are unaffected: whatever grant they were published
  under stands for those versions.

- 1264a03: `OmfTableRow` now honours its own JSON Forms `rule` in both renderers, so a
  table can reveal rows in turn — a stepwise assessment such as CAM-ICU asks
  Feature 2 only once Feature 1 is present. A row is the layout itself and never
  passes through a dispatch, so the rule was previously ignored by React and
  Angular alike; both now resolve their rows through form-core's new
  `filterVisibleElements()`, the same evaluation the server uses. A `DISABLE` on a
  row is ANDed into every cell it contains. form-core also exports
  `hasElementRules()` for renderers that subscribe to state only when a container
  actually has conditional children.

### Patch Changes

- Updated dependencies [1264a03]
- Updated dependencies [1264a03]
  - @openmedform/form-schema-types@1.6.0

## 1.5.0

### Minor Changes

- a45a762: New `checkboxGroup` multi-select control in both renderers (one checkbox per
  coded option for `array` + `items.oneOf`/`enum` fields), with shared option
  resolution via `resolveMultiEnumOptions` in form-core. Its tester also rescues
  enum arrays mislabelled `checklistMatrix`, which previously rendered an empty
  grid. Fixes the Angular radio control's label-left layout showing
  `[object Object]` instead of option labels and never marking the selection.
  Angular string controls now honour `format: "time"` / `"date-time"` /
  `"email"` with native inputs, matching React. form-core exports
  `OMF_CONTROL_NAMES`, the canonical `omf.control` vocabulary both renderers
  parity-test against.

### Patch Changes

- Updated dependencies [a45a762]
  - @openmedform/form-schema-types@1.5.0

## 1.4.0

### Minor Changes

- 4865b2b: Clinical terminology bindings (P1 of the terminology epic)

  `OmfCoding` — FHIR `Coding` shape plus provenance (`source: 'ai'|'human'`,
  `confidence`, `verified`) — attachable to a field via `options.omf.coding` and
  to individual answer options via `options.omf.optionCoding`, keyed by the
  stored enum code. Bindings live inside the definition so every submission
  (pinned to its form version) is codified data.

  form-core gains `collectCodedItems(uiSchema, dataSchema)`: every Control as a
  dictionary row with resolved labels, section grouping, per-option rows, and
  whatever bindings it carries — the shared data source for the web dictionary
  panel, EMR embeddings, and the future codified export.

### Patch Changes

- Updated dependencies [4865b2b]
  - @openmedform/form-schema-types@1.4.0

## 1.3.0

### Patch Changes

- Updated dependencies [f211e42]
  - @openmedform/form-schema-types@1.3.0

## 1.2.1

### Patch Changes

- @openmedform/form-schema-types@1.2.1

## 1.2.0

### Minor Changes

- be3f183: Score single-selects, and stop showing enum codes to clinicians

  `options.omf.points` is one number for one control, which fits a tick-box row
  but not an instrument where the _choice_ carries the score — Morse Fall, Braden,
  GCS. New `options.omf.optionPoints` maps each enum code to its points, and
  `collectScoreItems`/`computeScore` price the selected option.

  Enum options also gained real labels. Both renderers printed the stored code
  verbatim, so a clinical form showed `CRUTCHES_CANE_WALKER` where the paper says
  "Crutches/Cane/Walker". The new `resolveEnumOptions` in `form-core` resolves
  `oneOf` titles, then `options.omf.optionLabels`, then the raw code — and both
  renderers use it, so React and Angular cannot label the same schema differently.
  The select/radio testers now also claim `oneOf`-style enums, which previously
  fell through to the vanilla renderer.

  The print engine resolves options the same way, so a printed sheet no longer
  shows codes where the paper form shows words. It is not listed above because
  it is unpublished (`ignore` in .changeset/config.json), and a changeset may not
  mix ignored with published packages.

### Patch Changes

- Updated dependencies [be3f183]
  - @openmedform/form-schema-types@1.2.0

## 1.1.0

### Minor Changes

- a2127c1: Make `recordTable` rows editable in place.

  A summary column naming one concrete field now renders that field's real control
  in the cell — date picker, select, number — so a row is filled in exactly as on
  the grid it was converted from. Previously every cell was read-only text and the
  only way to edit was the detail panel, which made a wide observation chart
  effectively unusable.

  - Derived columns stay read-only: `countOf` and `pairWith` have no single value
    to write back.
  - The actions column is **pinned to the right edge**. On a ten-column chart it
    used to scroll out of view, leaving a row with no way to be deleted.
  - `Open` is hidden when every field is already a column, since the panel it
    opens would be empty. Records with more fields keep it.
  - `isColumnEditable()` and `fieldsOutsideColumns()` added to form-core, shared
    by both renderers so a row behaves identically in the web app and an EMR.

- f57194d: Support matrix-shaped record tables and never fall back to the stock array widget.

  - `omf.recordTable.orientation: "columns"` renders records as columns with field
    labels down the left, mirroring paper charts that compare instances side by
    side (a cannula chart, an observation matrix). `instanceLabel` supplies the
    column noun — `"Cannula"` heads them "Cannula 1", "Cannula 2". Both
    orientations store identical data; the default stays `rows`.
  - Any array-of-objects control **without** `omf.recordTable` config now renders
    as a record table with columns derived from the item schema, instead of
    falling through to `@jsonforms/vanilla-renderers`' generic list. The
    "Add to … / Items / Valid / No data" widget is unreachable in both renderers.
  - `deriveRecordColumns()` added to form-core, shared by both renderers so a
    derived table is identical in the web app and in an EMR.
  - `omf.columns` entries accept an optional `key`, which `checklistMatrix` needs
    and the type had never modelled.

### Patch Changes

- Updated dependencies [f57194d]
  - @openmedform/form-schema-types@1.1.0

## 1.0.0

### Major Changes

- 1e62675: Remove the Form.io engine. JSON Forms is now the only engine (ADR-004).

  **Breaking:**

  - `FormDefinition` is no longer a discriminated union. The `engine` field, the
    `FormEngine` type, and the `isFormioDefinition` / `isJsonFormsDefinition`
    narrowing helpers are gone. `JsonFormsFormDefinition` is kept as an alias of
    `FormDefinition`, so imports of that name keep resolving — drop `engine:
'jsonforms'` from any definition you construct.
  - `FormRenderer` no longer accepts `patientContext` or `onSubmit`. Those
    belonged to the Form.io branch, which owned the patient banner and the submit
    lifecycle; render your own submit control and call your own handler.
  - `FormioBranch` and its props type are no longer exported.
  - `FormInstance` no longer carries `engine`.

  **Not breaking:**

  - `@openmedform/react-form-renderer/jsonforms` still resolves — it is now an
    alias of the package root, which is Form.io-free by construction.
  - The `omf` UI vocabulary, all clinical controls, the design tokens and the
    print engine are unchanged.

  Migration for an EMR integration is usually a two-line diff: delete
  `engine: 'jsonforms'` from the definition you build, and move your submit button
  out of the renderer.

### Minor Changes

- bdfcfd2: Add `recordTable` — the repeating clinical encounter log — plus `OmfTabsLayout`.

  A source form that carries a table the user adds rows to (a treatment day, a
  medication round, an observation entry) now renders as that table in both
  renderers: a toolbar with a live count and an add button, one summary row per
  record, and an expandable inline detail panel with a Close button. Previously an
  array of objects fell through to the stock JSON Forms list widget
  ("Add to … / Items / Valid / No data"), which looks nothing like the source.

  - `options.omf.control: "recordTable"` with `omf.recordTable`
    (`addLabel`, `countLabel`, `emptyLabel`, `removeConfirm`, `columns`). Columns
    read a dot path inside one record, with `pairWith` for a combined `A / B`
    header and `countOf` for a header that counts nested records.
  - `options.detail` holds the per-record UI schema — typically an `OmfTabsLayout`,
    a new layout that turns its children into tab pages titled by their labels.
  - Record tables nest: a treatment day's drug list is itself a `recordTable`, and
    the parent's "Drugs" column counts it.
  - Summary-cell derivation, record seeding and the count line live once in
    `@openmedform/form-core` (`record-table/summary.ts`) and are shared by both
    renderers, so a log cannot read differently in an EMR than in the web preview.

### Patch Changes

- Updated dependencies [bdfcfd2]
- Updated dependencies [1e62675]
  - @openmedform/form-schema-types@1.0.0

## 0.5.0

### Patch Changes

- Updated dependencies [b74ba2d]
  - @openmedform/form-schema-types@0.5.0

## 0.4.1

### Patch Changes

- @openmedform/form-schema-types@0.4.1

## 0.4.0

### Patch Changes

- @openmedform/form-schema-types@0.4.0

## 0.3.0

### Patch Changes

- Updated dependencies [499b0bc]
  - @openmedform/form-schema-types@0.3.0

## 0.2.0

### Patch Changes

- @openmedform/form-schema-types@0.2.0
