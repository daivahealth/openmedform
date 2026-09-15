---
"@openmedform/form-core": minor
"@openmedform/react-form-renderer": patch
"@openmedform/angular-form-renderer": patch
"@openmedform/form-print-engine": patch
---

Units read like a chart, not like a code table. `form-core` gains
`displayUnit(ucum)` — `Cel` → `°C`, `[degF]` → `°F`, `mm[Hg]` → `mmHg`,
`10*9/L` → `×10⁹/L`, and the other common vital-sign and lab units; an unknown
code passes through unchanged. `formatObservationValue` uses it, so the
previous-value chip, both `Flowsheet` components and `renderFlowsheetHtml`
all show symbols. The stored `omf.unit` and the `Observation.unit` on the wire
stay UCUM, which is what FHIR wants.
