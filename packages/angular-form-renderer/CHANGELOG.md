# @openmedform/angular-form-renderer

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
  - @openmedform/form-core@1.9.0
  - @openmedform/form-design-tokens@1.9.0

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
  - @openmedform/form-core@1.8.0
  - @openmedform/form-design-tokens@1.8.0

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
  - @openmedform/form-core@1.7.1
  - @openmedform/form-design-tokens@1.7.1

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
  - @openmedform/form-core@1.7.0
  - @openmedform/form-design-tokens@1.7.0

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
  - @openmedform/form-core@1.6.0
  - @openmedform/form-design-tokens@1.6.0

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
  - @openmedform/form-core@1.5.0
  - @openmedform/form-design-tokens@1.5.0

## 1.4.1

### Patch Changes

- Updated dependencies [4865b2b]
  - @openmedform/form-schema-types@1.4.0
  - @openmedform/form-core@1.4.0
  - @openmedform/form-design-tokens@1.4.0

## 1.4.0

### Minor Changes

- f211e42: Add `options.omf.hideSectionTotal` — suppress a section's automatic Σ chip

  A section containing scored fields gets a live "Σ n" subtotal chip in its
  header automatically. That chip was renderer-drawn with no schema opt-out, so
  an author (or the refine AI) asked to "remove the Σ 0 from that box" had no
  way to express it — the request failed silently. The flag hides the badge on
  that one section, in both renderers; the fields stay scored and keep feeding
  the grand total.

### Patch Changes

- Updated dependencies [f211e42]
  - @openmedform/form-schema-types@1.3.0
  - @openmedform/form-core@1.3.0
  - @openmedform/form-design-tokens@1.3.0

## 1.3.1

### Patch Changes

- bd16429: Fix a `oneOf` enum rendering as an empty text box

  `{ type: "string", oneOf: [...] }` is both a string control and a single-select.
  The React string-input tester excluded `isEnumControl` but not
  `isOneOfEnumControl`, so it matched at the same rank as the select — and being
  registered first, it won. Every scored dropdown in a converted form rendered as
  an empty text box with its options nowhere on screen, which also left the score
  stuck at zero because nothing could be selected.

  The input tester now excludes both. Angular was already correct because its enum
  tester outranks the text control; that ordering is now asserted by a test rather
  than holding by accident, which meant moving `enumControlTester` and
  `textControlTester` into the pure `testers` module so they can be imported
  without pulling in Angular.

  - @openmedform/form-schema-types@1.2.1
  - @openmedform/form-core@1.2.1
  - @openmedform/form-design-tokens@1.2.1

## 1.3.0

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
  - @openmedform/form-core@1.2.0
  - @openmedform/form-design-tokens@1.2.0

## 1.2.0

### Minor Changes

- 2d33196: Honour JSON Forms `rule` (SHOW/HIDE/ENABLE/DISABLE) on layouts, Labels and the score summary, not just on controls.

  Controls already read the `hidden` flag the Angular base supplies. Everything built on `JsonFormsBaseRenderer` — VerticalLayout, HorizontalLayout, Group, OmfTableLayout, OmfTabsLayout, Label, scoreSummary — had no such flag, so a rule on a Group silently did nothing here while the React renderer honoured it. The new `RuleAwareRenderer` base evaluates the rule with the same `form-core` code the server and React renderer use, and subscribes only when an element actually carries one. `recordTable` now guards on `hidden` too.

  This matters now that HTML conversion emits SHOW rules for conditional "Other → Please specify…" fields.

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

- Updated dependencies [a2127c1]
- Updated dependencies [f57194d]
  - @openmedform/form-core@1.1.0
  - @openmedform/form-schema-types@1.1.0
  - @openmedform/form-design-tokens@1.1.0

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
  - @openmedform/form-core@1.0.0
  - @openmedform/form-design-tokens@1.0.0

## 0.4.0

### Minor Changes

- b74ba2d: Render source tables as real grids, and add table support to the Angular renderer.

  `OmfTableLayout` gains `options.omf.columns` (`{ label, width, align }[]`). With
  columns declared it renders a true grid — a header row plus ONE cell per child,
  aligned to the columns — instead of the previous two-cell (row label | all
  contents) layout that stacked and wrapped every field. Cell controls no longer
  repeat their own label, since the column header already names them. Column
  widths and alignment carry over from the source, and a wide table scrolls inside
  its own container rather than pushing the host page sideways. Omitting `columns`
  keeps the existing left-label behaviour unchanged.

  The Angular renderer previously had **no** `OmfTableLayout` renderer at all, so
  any form containing a table fell through to "No applicable renderer found!".
  It now implements the same two modes as React.

### Patch Changes

- Updated dependencies [b74ba2d]
  - @openmedform/form-schema-types@0.5.0
  - @openmedform/form-core@0.5.0
  - @openmedform/form-design-tokens@0.5.0

## 0.3.2

### Patch Changes

- 31f8068: Fix severe typing/checkbox lag in the Angular renderer under a data-round-trip host (e.g. an EMR that binds `[data]` back to the object it just received from `(dataChange)`).

  - **Echo-loop guard:** `OmfFormComponent` no longer re-feeds its own `(dataChange)` emission into `<jsonforms> [data]`. It skips an incoming value that is reference-identical to what it just emitted, so a keystroke no longer triggers a second, full-schema `updateCoreState` reducer pass (re-validate the whole schema, re-notify every control) on top of the scoped update the edited control already applied.
  - **OnPush containers:** the layout containers (Vertical/Horizontal/Group/Label) and the score summary use `ChangeDetectionStrategy.OnPush`, so a keystroke re-checks only the path from root to the edited control plus the live score totals — not the entire form. `childProps` is memoized so the OnPush re-checks don't churn the `<jsonforms-outlet>` children. (Note: cross-field `rule`-driven visibility/enablement on non-edited controls isn't refreshed until touched; current forms carry no conditional rules.)

## 0.3.1

### Patch Changes

- 3bf5855: Fix Angular renderer performance and boxed-group layout.

  - **Perf:** the `scoreSummary` and every scored `Group` subscribed to JsonForms'
    `$state` and recomputed on _every_ emission (validation/focus/config, not just
    data edits); `scoreSummary` also re-walked the whole UI schema each time. On a
    large scored form this caused input lag in the host app. Both now recompute
    only when the response data (or, for the summary, the UI schema) reference
    actually changes, via `distinctUntilChanged`, and the summary caches its
    collected score items. Behaviour is unchanged — same totals/subtotals/risk band.
  - **Layout:** boxed sections rendered as `<fieldset>`/`<legend>`; a flex
    `<legend>` pushed the first item of every box outside the box (to the top-right).
    Groups now use the same `<div>` header + body structure as the React renderer,
    so every item sits inside its box and the two renderers match.
  - @openmedform/form-schema-types@0.4.1
  - @openmedform/form-core@0.4.1
  - @openmedform/form-design-tokens@0.4.1

## 0.3.0

### Minor Changes

- aa88f31: Add a `checklistMatrix` control for periodic-reassessment grids.

  New `options.omf.control: "checklistMatrix"` renders a rows × columns checkbox
  grid (e.g. Nursing Diagnosis × Day 1–5), configured via `options.omf.rows` /
  `options.omf.columns` and bound to an object value `{ [rowKey]: { [colKey]: true } }`.
  Rendered identically in the React and Angular renderers. The jsonforms conversion
  prompt now uses it for daily/periodic reassessment tables and extracts dense
  multi-page sections (side-by-side contraindication/orders boxes, long medication
  lists) exhaustively instead of leaving later sections empty.

### Patch Changes

- @openmedform/form-schema-types@0.4.0
- @openmedform/form-core@0.4.0
- @openmedform/form-design-tokens@0.4.0

## 0.2.0

### Minor Changes

- cf39bfd: Package the Angular renderer for npm (ng-packagr / Angular Package Format).

  `@openmedform/angular-form-renderer` is now publishable: an `ng-packagr` build
  emits partial-Ivy FESM2022 + a flattened `index.d.ts` to `dist`, the package is
  `private: false` with `publishConfig` (public access, entry points into `dist`),
  `peerDependencies` on `@angular/*` + `rxjs`, and workspace deps on
  `@openmedform/form-core` / `form-design-tokens` / `form-schema-types`. `pnpm pack`
  produces an installable Angular-library tarball. Consumers install it and drop
  `<omf-form [definition]="def">` into any standalone Angular 20 app.
