---
"@openmedform/form-core": minor
"@openmedform/react-form-renderer": minor
---

Observation history, part 2 of ADR-005: the React renderer shows a field's
PRIOR values when the host supplies them.

`FormRenderer` / `JsonFormsRenderer` accept `history` (prior fills as the host
stored them, each optionally with the definition it was filled against) and
`historyProvider` (a lazy per-field lookup the host implements — it closes over
the patient, the renderer never sees an identifier). A Control whose definition
carries `omf.history` gets a chip under it — "Previous 84 /min · 2h ago · ↑ +6"
— that opens a popover with the last N readings (clock, author) and a sparkline
for numeric fields. Alignment is by LOINC/SNOMED binding first, so readings
taken against an older version of the form, or a different form, line up under
the right field. A unit change between readings is flagged, never converted.
Fields without `omf.history`, and forms with no host history, render exactly as
before.

New `<Flowsheet definition entries|observations />`: parameters down the left,
one column per occurrence across the top, newest first, sections from the
form's Groups, superseded readings struck through. `FieldHistory` is exported
for custom controls that want the same chip.

`form-core` gains the shared model behind both: `buildFlowsheet` (the grid),
`formatObservationValue`, `relativeAge`, `formatClock` / `formatDay`, and the
`source.author` / `source.superseded` conventions. The Angular renderer will
render the same model; it follows in its own release.
