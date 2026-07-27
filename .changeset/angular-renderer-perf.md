---
"@openmedform/angular-form-renderer": patch
---

Fix Angular renderer performance and boxed-group layout.

- **Perf:** the `scoreSummary` and every scored `Group` subscribed to JsonForms'
  `$state` and recomputed on *every* emission (validation/focus/config, not just
  data edits); `scoreSummary` also re-walked the whole UI schema each time. On a
  large scored form this caused input lag in the host app. Both now recompute
  only when the response data (or, for the summary, the UI schema) reference
  actually changes, via `distinctUntilChanged`, and the summary caches its
  collected score items. Behaviour is unchanged — same totals/subtotals/risk band.
- **Layout:** boxed sections rendered as `<fieldset>`/`<legend>`; a flex
  `<legend>` pushed the first item of every box outside the box (to the top-right).
  Groups now use the same `<div>` header + body structure as the React renderer,
  so every item sits inside its box and the two renderers match.
