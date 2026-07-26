# @openmedform/angular-form-renderer

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
