# @openmedform/form-core

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
