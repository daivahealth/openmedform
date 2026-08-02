---
'@openmedform/angular-form-renderer': minor
---

Honour JSON Forms `rule` (SHOW/HIDE/ENABLE/DISABLE) on layouts, Labels and the score summary, not just on controls.

Controls already read the `hidden` flag the Angular base supplies. Everything built on `JsonFormsBaseRenderer` — VerticalLayout, HorizontalLayout, Group, OmfTableLayout, OmfTabsLayout, Label, scoreSummary — had no such flag, so a rule on a Group silently did nothing here while the React renderer honoured it. The new `RuleAwareRenderer` base evaluates the rule with the same `form-core` code the server and React renderer use, and subscribes only when an element actually carries one. `recordTable` now guards on `hidden` too.

This matters now that HTML conversion emits SHOW rules for conditional "Other → Please specify…" fields.
