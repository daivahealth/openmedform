# Clinical Terminology Bindings

Map form fields — and individual answer options — to standard clinical codes
(SNOMED CT, LOINC, ICD-10), review them in the **Dictionary** panel, and store
the bindings inside the form definition itself. Epic: issue #133.

## Where bindings live

On the UI element, under the omf namespace:

- `options.omf.coding: OmfCoding[]` — the field (the question).
- `options.omf.optionCoding: { [enumCode]: OmfCoding[] }` — per answer option,
  keyed by the stored code (same key space as `optionPoints`/`optionLabels`).

`OmfCoding` is FHIR `Coding` shape plus provenance:
`{ system, code, display?, source: 'ai'|'human', confidence?, verified }`.

Chosen over a dataSchema keyword deliberately: Ajv runs strict in every engine
(API validation, React, Angular), so a custom keyword would need registering in
all of them, while the omf bag already flows through assembly, refine and both
renderers untouched. Renderers ignore bindings entirely — codes never render on
the form; the dictionary is their only UI.

Because bindings ride in the definition and every submission is pinned to its
exact form version, submitted answers are codified data retroactively and
forever — the basis for cross-form queries, FHIR export (#79) and registry
reporting (#137).

## The Dictionary panel

On the form preview page, the side panel has two tabs: **Refine with AI** and
**Dictionary**. The dictionary lists every field (from form-core's
`collectCodedItems`, so exports and embeddings see exactly what the panel
shows), grouped by section, with per-option rows under enum controls:

- **Approve** — flips an unverified binding (amber, typically `source: 'ai'`)
  to verified (green). Provenance is kept: an approved AI suggestion stays
  `source: 'ai', verified: true`.
- **Remove** — deletes a binding.
- **Add code** — manual binding (system + code + display), stored as
  `source: 'human', verified: true`. P2 (#135) replaces manual entry with
  LOINC search + AI suggestions.

## Write path

`PATCH /api/forms/:id/coding` with `{ scope, optionCode?, coding[] }` replaces
that target's binding list (empty clears it). Same immutability rule as
refine: drafts are edited in place, published versions fork a new draft. Every
write is audited (`form.coding.update`) with the acting user and the
`system|code|verified` list.

## Verification gate

`verified` is the clinical gate. Nothing downstream should treat an
unverified binding as authoritative; exports (#137) will carry the flag and
default to verified-only.
