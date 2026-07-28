---
"@openmedform/angular-form-renderer": patch
---

Fix severe typing/checkbox lag in the Angular renderer under a data-round-trip host (e.g. an EMR that binds `[data]` back to the object it just received from `(dataChange)`).

- **Echo-loop guard:** `OmfFormComponent` no longer re-feeds its own `(dataChange)` emission into `<jsonforms> [data]`. It skips an incoming value that is reference-identical to what it just emitted, so a keystroke no longer triggers a second, full-schema `updateCoreState` reducer pass (re-validate the whole schema, re-notify every control) on top of the scoped update the edited control already applied.
- **OnPush containers:** the layout containers (Vertical/Horizontal/Group/Label) and the score summary use `ChangeDetectionStrategy.OnPush`, so a keystroke re-checks only the path from root to the edited control plus the live score totals — not the entire form. `childProps` is memoized so the OnPush re-checks don't churn the `<jsonforms-outlet>` children. (Note: cross-field `rule`-driven visibility/enablement on non-edited controls isn't refreshed until touched; current forms carry no conditional rules.)
