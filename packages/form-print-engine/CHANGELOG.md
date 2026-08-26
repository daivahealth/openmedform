# @openmedform/form-print-engine

## 0.3.0

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

## 0.2.2

### Patch Changes

- Updated dependencies [a8cf9c1]
  - @openmedform/form-schema-types@1.7.1
  - @openmedform/form-core@1.7.1

## 0.2.1

### Patch Changes

- Updated dependencies [e2c8624]
  - @openmedform/form-schema-types@1.7.0
  - @openmedform/form-core@1.7.0

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
