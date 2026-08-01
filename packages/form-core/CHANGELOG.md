# @openmedform/form-core

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
