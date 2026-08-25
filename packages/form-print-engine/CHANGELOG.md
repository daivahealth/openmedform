# @openmedform/form-print-engine

## 0.2.0

### Minor Changes

- 1264a03: `@openmedform/form-print-engine` is now published to npm. It was `private: true`
  and in the changesets ignore list, so the install line the integration guide
  gives third parties could never resolve; it now builds to `dist` with type
  declarations under `publishConfig` like the other packages, and versions
  independently of the fixed group (as `angular-form-renderer` does).

  The engine also honours conditional `rule`s, using the same `form-core`
  evaluation the renderers and the server use, so a condition cannot mean one
  thing on screen and another on paper. Which way it resolves follows what the
  sheet is for: `renderPrintHtml(definition)` prints every conditional section,
  because a blank sheet is there to be filled in by hand, while
  `renderPrintHtml(definition, { data })` omits a section the response never
  triggered, because a question that was never asked does not belong in the
  record. The new `rules: 'apply' | 'ignore'` option overrides either default.
  Only visibility applies — `ENABLE`/`DISABLE` describe an input's interactivity
  and have no meaning on paper, so a disabled field still prints.

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

### Patch Changes

- Updated dependencies [1264a03]
- Updated dependencies [1264a03]
  - @openmedform/form-schema-types@1.6.0
  - @openmedform/form-core@1.6.0
