---
"@openmedform/form-schema-types": minor
---

`omf.effectiveAt: true` on a date/date-time Control marks it as the clinical
time of the whole response — when the readings were taken, as opposed to when
the form was saved. The OpenMedForm API reads it to set a submission's
`effectiveAt` on completion (ADR-005); a host storing its own responses should
do the same, since every history chip and flowsheet column sorts on that time.
