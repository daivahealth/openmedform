---
"@openmedform/angular-form-renderer": patch
---

Fix a performance hot-spot in the Angular renderer's live scoring.

The `scoreSummary` and every scored `Group` subscribed to JsonForms' `$state`
and recomputed on **every** emission — including validation, focus and config
changes, not just data edits — and `scoreSummary` re-walked the entire UI schema
each time. On a large scored form this multiplied into noticeable input lag.
Both now recompute only when the response data (or, for the summary, the UI
schema) actually changes, via `distinctUntilChanged`; the summary caches its
collected score items instead of re-walking the tree. Behaviour is unchanged —
the same totals/subtotals/risk band, computed far less often.
