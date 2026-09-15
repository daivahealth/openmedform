---
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
"@openmedform/form-core": patch
---

Section-level history (ADR-006, part 2). Both renderers now honour
`omf.history` declared on a Group: the history scope resolves each field's
effective setting once (`resolveHistoryConfig`) and every previous-value chip
reads from that map, so "show previous values on the Observations section" is
one setting in the definition rather than one per field. A field's own
`omf.history` still overrides, and `{ show: 'none' }` opts it out. Forms that
declare history per field behave exactly as before.

The shipped `vitalsHistoryReference` fixture now declares history once on its
Observations section, with two fields narrowing to a popover and SpO2 asking
for more rows — the shape a converted vitals chart should take.
