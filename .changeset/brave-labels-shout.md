---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
"@openmedform/form-print-engine": minor
---

`omf.accentColor` on a `Label` now renders it as a **callout** — bordered, bold
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
