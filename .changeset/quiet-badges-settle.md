---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

The automatic "Σ n" section subtotal chip is now drawn on the INNERMOST scoring
section only. Summing every scored descendant put a total on every ancestor too
— a Sepsis sheet whose qSOFA and SIRS boxes each score out of 3 and 4 also grew
a `Σ 0` on the box around them and another on the whole screening section,
neither of which the paper form totals. Both renderers now share form-core's new
`showsSectionSubtotal()`, and the new `omf.showSectionTotal` puts the chip back
on an outer Group whose combined total the source really does print
(`omf.hideSectionTotal` still removes one). Scoring is unchanged either way:
every item still feeds the grand total and the per-section breakdown.
