# @openmedform/form-design-tokens

## 1.9.0

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

## 1.8.0

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

## 1.7.1

### Patch Changes

- a8cf9c1: Documented and pinned root-scope conditions. A rule condition whose `scope` is
  `#` resolves to the whole response rather than one field, so its `schema` can
  combine several answers with ordinary JSON Schema — `properties` + `required`
  for AND, `anyOf` for OR. That is what a derived clinical outcome needs
  ("POSITIVE only if Feature 1 AND Feature 2 AND (Feature 3 OR Feature 4)"),
  expressed as one `Label` per outcome and evaluated by the same deterministic
  `form-core` code as every other rule — no expression language, no `eval`.

  This already worked; nothing in the engine changed. It is now covered by tests
  in form-core and the React renderer so it cannot regress, and documented in
  FORM-BUILDER.md, because conversion now emits it for mock-ups that compute a
  result banner in JavaScript.

## 1.7.0

### Minor Changes

- e2c8624: The automatic "Σ n" section subtotal chip is now drawn on the INNERMOST scoring
  section only. Summing every scored descendant put a total on every ancestor too
  — a Sepsis sheet whose qSOFA and SIRS boxes each score out of 3 and 4 also grew
  a `Σ 0` on the box around them and another on the whole screening section,
  neither of which the paper form totals. Both renderers now share form-core's new
  `showsSectionSubtotal()`, and the new `omf.showSectionTotal` puts the chip back
  on an outer Group whose combined total the source really does print
  (`omf.hideSectionTotal` still removes one). Scoring is unchanged either way:
  every item still feeds the grand total and the per-section breakdown.

## 1.6.0

### Minor Changes

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

- 1264a03: `OmfTableRow` now honours its own JSON Forms `rule` in both renderers, so a
  table can reveal rows in turn — a stepwise assessment such as CAM-ICU asks
  Feature 2 only once Feature 1 is present. A row is the layout itself and never
  passes through a dispatch, so the rule was previously ignored by React and
  Angular alike; both now resolve their rows through form-core's new
  `filterVisibleElements()`, the same evaluation the server uses. A `DISABLE` on a
  row is ANDed into every cell it contains. form-core also exports
  `hasElementRules()` for renderers that subscribe to state only when a container
  actually has conditional children.

## 1.5.0

### Minor Changes

- a45a762: New `checkboxGroup` multi-select control in both renderers (one checkbox per
  coded option for `array` + `items.oneOf`/`enum` fields), with shared option
  resolution via `resolveMultiEnumOptions` in form-core. Its tester also rescues
  enum arrays mislabelled `checklistMatrix`, which previously rendered an empty
  grid. Fixes the Angular radio control's label-left layout showing
  `[object Object]` instead of option labels and never marking the selection.
  Angular string controls now honour `format: "time"` / `"date-time"` /
  `"email"` with native inputs, matching React. form-core exports
  `OMF_CONTROL_NAMES`, the canonical `omf.control` vocabulary both renderers
  parity-test against.

## 1.4.0

## 1.3.0

## 1.2.1

## 1.2.0

## 1.1.0

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

## 0.5.0

## 0.4.1

## 0.4.0

## 0.3.0

## 0.2.0
