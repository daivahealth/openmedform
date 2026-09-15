---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
---

Section-level history (ADR-006, part 1). `omf.history` may now be set on a
Group (or any section layout) and is inherited by the reading-bearing
Controls beneath it — the nearest section wins, a Control's own value
overrides, and `{ show: 'none' }` opts one field out. Display controls
(matrices, charts, summaries, signature) never inherit; a `recordTable`'s
record fields do.

`form-core`: `collectHistoryFields` rows carry the effective `history` and a
`historyInherited` flag; new `resolveHistoryConfig(definition)` returns the
effective setting per field key, which the renderers will read in place of the
raw element (part 2). `collectCodedItems` rows gain `sectionPointer`, the JSON
pointer of the nearest Group in the layout — the address a section-level write
from the Dictionary needs, since Groups have no scope.
