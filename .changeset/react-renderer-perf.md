---
"@openmedform/react-form-renderer": patch
---

Memoize live-scoring work in the React renderer.

`OmfScoreSummary` re-walked the entire UI schema (`collectScoreItems`) and
`OmfGroup` re-walked its subtree on every render — and `useJsonForms()` re-renders
these on every JsonForms state change (validation/focus/config, not just data
edits). Both are now wrapped in `useMemo`: the tree walk runs only when the UI
schema reference changes and the sum only when the response data changes.
Behaviour is unchanged (same totals/subtotals/risk band) — this mirrors the
equivalent Angular renderer fix so both stay cheap on large scored forms.
