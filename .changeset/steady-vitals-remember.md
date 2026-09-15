---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
---

Observation history, part 1 of ADR-005: the contracts and the core logic that
let a host show a field's PRIOR values (previous-value chip, trend, flowsheet)
when a form is filled repeatedly for one patient — including inside an EMR,
where OpenMedForm holds no patient data and the host supplies the history.

`form-schema-types` gains `Observation` (one scalar reading, FHIR-shaped, with
its terminology binding and a clinical `effectiveAt`), `HistoryEntry`,
`HistoryQuery` and `HistoryProvider` (the batch and lazy shapes a renderer will
accept), and three `omf` keys: `unit` (UCUM string on a numeric field),
`history` (`{ show, count, trend }` — the designer decides which fields show
history) and `recordTable.effectiveAtPath` (a per-record timestamp field, so
an hourly chart signed once still trends by the hour).

`form-core` gains `projectObservations` (flatten a response into observations —
scalars, coded answers with their option binding, one row per multi-select
option, every record of a `recordTable`), `alignHistory` /
`alignHistoryEntries` (which prior observations belong to which field of the
current definition: by LOINC/SNOMED code first, so a series survives a rename,
a move or a different form; by index-free data path second; never by label),
`mergeHistory`, trend prep (`trendPoints`, `latestDelta` with a unit-mismatch
flag instead of a silent conversion, `hasMixedUnits`) and `toFhirObservation`
for hosts whose store is FHIR R4. No renderer changes yet; those follow.
