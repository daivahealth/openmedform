---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
"@openmedform/form-print-engine": minor
---

`omf.bands` now works on a scored `Group`, not only on a `scoreSummary` control.
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
