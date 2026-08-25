---
"@openmedform/form-print-engine": minor
---

`@openmedform/form-print-engine` is now published to npm. It was `private: true`
and in the changesets ignore list, so the install line the integration guide
gives third parties could never resolve; it now builds to `dist` with type
declarations under `publishConfig` like the other packages, and versions
independently of the fixed group (as `angular-form-renderer` does).

The engine also honours conditional `rule`s, using the same `form-core`
evaluation the renderers and the server use, so a condition cannot mean one
thing on screen and another on paper. Which way it resolves follows what the
sheet is for: `renderPrintHtml(definition)` prints every conditional section,
because a blank sheet is there to be filled in by hand, while
`renderPrintHtml(definition, { data })` omits a section the response never
triggered, because a question that was never asked does not belong in the
record. The new `rules: 'apply' | 'ignore'` option overrides either default.
Only visibility applies — `ENABLE`/`DISABLE` describe an input's interactivity
and have no meaning on paper, so a disabled field still prints.
