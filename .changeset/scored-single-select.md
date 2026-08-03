---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
"@openmedform/form-print-engine": minor
---

Score single-selects, and stop showing enum codes to clinicians

`options.omf.points` is one number for one control, which fits a tick-box row
but not an instrument where the *choice* carries the score — Morse Fall, Braden,
GCS. New `options.omf.optionPoints` maps each enum code to its points, and
`collectScoreItems`/`computeScore` price the selected option.

Enum options also gained real labels. Both renderers printed the stored code
verbatim, so a clinical form showed `CRUTCHES_CANE_WALKER` where the paper says
"Crutches/Cane/Walker". The new `resolveEnumOptions` in `form-core` resolves
`oneOf` titles, then `options.omf.optionLabels`, then the raw code — and both
renderers use it, so React and Angular cannot label the same schema differently.
The select/radio testers now also claim `oneOf`-style enums, which previously
fell through to the vanilla renderer.

The print engine resolves options the same way, so a printed sheet no longer
shows codes where the paper form shows words.
