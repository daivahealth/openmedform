---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
---

Clinical terminology bindings (P1 of the terminology epic)

`OmfCoding` — FHIR `Coding` shape plus provenance (`source: 'ai'|'human'`,
`confidence`, `verified`) — attachable to a field via `options.omf.coding` and
to individual answer options via `options.omf.optionCoding`, keyed by the
stored enum code. Bindings live inside the definition so every submission
(pinned to its form version) is codified data.

form-core gains `collectCodedItems(uiSchema, dataSchema)`: every Control as a
dictionary row with resolved labels, section grouping, per-option rows, and
whatever bindings it carries — the shared data source for the web dictionary
panel, EMR embeddings, and the future codified export.
