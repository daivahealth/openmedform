# @openmedform/react-form-renderer

## 0.5.0

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

## 0.4.1

### Patch Changes

- 454223a: Memoize live-scoring work in the React renderer.

  `OmfScoreSummary` re-walked the entire UI schema (`collectScoreItems`) and
  `OmfGroup` re-walked its subtree on every render — and `useJsonForms()` re-renders
  these on every JsonForms state change (validation/focus/config, not just data
  edits). Both are now wrapped in `useMemo`: the tree walk runs only when the UI
  schema reference changes and the sum only when the response data changes.
  Behaviour is unchanged (same totals/subtotals/risk band) — this mirrors the
  equivalent Angular renderer fix so both stay cheap on large scored forms.

  - @openmedform/form-schema-types@0.4.1
  - @openmedform/form-core@0.4.1
  - @openmedform/form-design-tokens@0.4.1

## 0.4.0

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

## 0.3.0

### Patch Changes

- Updated dependencies [499b0bc]
  - @openmedform/form-schema-types@0.3.0
  - @openmedform/form-core@0.3.0
  - @openmedform/form-design-tokens@0.3.0

## 0.2.0

### Minor Changes

- 721a447: Initial public release of the OpenMedForm JSON Forms renderer packages: framework-independent
  contracts and Ajv 2020-12 validation (`form-core`), shared design tokens, and the React renderer
  with a Form.io-free `/jsonforms` entry point.

### Patch Changes

- @openmedform/form-schema-types@0.2.0
- @openmedform/form-core@0.2.0
- @openmedform/form-design-tokens@0.2.0
