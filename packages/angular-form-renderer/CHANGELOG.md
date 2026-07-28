# @openmedform/angular-form-renderer

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
