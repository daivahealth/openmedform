---
"@openmedform/form-print-engine": minor
"@openmedform/form-core": minor
---

`renderFlowsheetHtml(definition, { entries | observations, … })` prints a
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
