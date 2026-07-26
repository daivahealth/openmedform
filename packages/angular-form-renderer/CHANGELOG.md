# @openmedform/angular-form-renderer

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
