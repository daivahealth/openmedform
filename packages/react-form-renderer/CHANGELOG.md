# @openmedform/react-form-renderer

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
