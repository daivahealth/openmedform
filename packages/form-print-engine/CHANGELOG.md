# @openmedform/form-print-engine

## 0.5.2

### Patch Changes

- Updated dependencies [769fdc6]
- Updated dependencies [c3b4b5c]
  - @openmedform/form-schema-types@1.12.0
  - @openmedform/form-core@1.12.0

## 0.5.1

### Patch Changes

- e64b193: Units read like a chart, not like a code table. `form-core` gains
  `displayUnit(ucum)` — `Cel` → `°C`, `[degF]` → `°F`, `mm[Hg]` → `mmHg`,
  `10*9/L` → `×10⁹/L`, and the other common vital-sign and lab units; an unknown
  code passes through unchanged. `formatObservationValue` uses it, so the
  previous-value chip, both `Flowsheet` components and `renderFlowsheetHtml`
  all show symbols. The stored `omf.unit` and the `Observation.unit` on the wire
  stay UCUM, which is what FHIR wants.
- Updated dependencies [e64b193]
  - @openmedform/form-core@1.11.0
  - @openmedform/form-schema-types@1.11.0

## 0.5.0

### Minor Changes

- 9e8027f: `renderFlowsheetHtml(definition, { entries | observations, … })` prints a
  patient's readings across time — parameters down the left, one column per
  occurrence, newest first — as a self-contained A4 landscape HTML document
  (ADR-005). It draws the same form-core `buildFlowsheet` grid the React and
  Angular `Flowsheet` components draw, so paper and screen agree: readings taken
  against an older version of the form line up by LOINC/SNOMED binding, a row
  that mixes units shows the unit in every cell, coded answers print their
  labels, superseded readings are struck through. Wide sheets continue on a new
  page after `columnsPerPage` (default 12) with the parameter spine repeated;
  `headerLines` and `footer` are the host's to fill.

  `form-core`: `collectHistoryFields` now resolves each field's display label
  (element label, schema title, then key), and `buildFlowsheet` uses it, so a
  blank chart printed to be filled by hand reads like the form rather than
  showing raw keys.

### Patch Changes

- Updated dependencies [048e627]
- Updated dependencies [788971a]
- Updated dependencies [9e8027f]
- Updated dependencies [b77b0d3]
- Updated dependencies [35e9ed6]
  - @openmedform/form-core@1.10.0
  - @openmedform/form-schema-types@1.10.0

## 0.4.0

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
