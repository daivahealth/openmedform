---
"@openmedform/angular-form-renderer": minor
"@openmedform/form-core": minor
---

Observation history, part 3 of ADR-005: the Angular renderer reaches parity
with React.

`<omf-form>` accepts `[history]` (prior fills as the host stored them, each
optionally with the definition it was filled against) and `[historyProvider]`
(a lazy per-field lookup the host implements — it closes over the patient, the
renderer never sees an identifier). Every value control whose definition
carries `omf.history` gets the same chip as in React — "Previous 84 /min · 2h
ago · ↑ +6" — with a popover of the last N readings, author and a sparkline.
New `<omf-flowsheet>` draws the same grid as the React `Flowsheet`. Both are
thin views over form-core's shared model, so the two frameworks cannot
disagree about a previous reading.

`form-core` exports a `vitalsHistoryReference` / `vitalsHistoryV2` /
`vitalsHistoryEntries()` fixture — a q2h vitals form in two versions with a
shift of prior fills — used by both demos and useful for testing a host
integration.
