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
- **Add code** — manual binding. For LOINC, a search box offers real codes
  from the loaded table (name, synonym, or exact-code lookup); picking one
  fills code + display. Stored as `source: 'human', verified: true`.
- **Suggest codes** — the retrieve-then-select AI pass (#135): for every
  uncoded field, the local LOINC table produces candidates and the model may
  only choose among them or decline — it can never invent a code; anything it
  returns that was not offered is dropped. Suggestions land as amber
  unverified chips (with confidence) for approval, never overwrite existing
  bindings, and are skipped below a 0.5 confidence floor. Audited
  `form.coding.suggest`, metered `coding.suggest`.

## Loading LOINC

The seed ships ~10 ubiquitous vital-sign codes so the feature works out of the
box. For real coverage, download the official "LOINC Table File (CSV)" from
https://loinc.org (free account; the license — which also bars redistributing
the table — is accepted there) and load it:

    cd apps/api && npx tsx scripts/import-loinc.ts /path/to/Loinc.csv

Re-running upserts, so new LOINC releases load over old ones. This material
contains content from LOINC (https://loinc.org), © Regenstrief Institute,
Inc. and the LOINC Committee, under https://loinc.org/license.

## ICD-10 (#136)

Same pattern as LOINC with a public-domain source: download the CMS
"ICD-10-CM Order File" from https://www.cms.gov/medicare/coding-billing/icd-10-codes
and load it:

    cd apps/api && npx tsx scripts/import-icd10.ts /path/to/icd10cm_order_2026.txt

The seed ships a handful of common category codes (diabetes, hypertension,
asthma, CKD, IHD, COPD) as a starter. ICD-10 search is available to every
tenant once loaded — no licensing gate.

## SNOMED CT and the licensing gate (#136)

SNOMED CT is member-country licensed, so it is DOUBLY gated, server-side:

1. **Operator**: configure `SNOMED_FHIR_URL` — a FHIR terminology server that
   hosts SNOMED (Snowstorm or Ontoserver, self-hosted with your national
   release, or a licensed hosted endpoint). Search uses
   `ValueSet/$expand?url=http://snomed.info/sct?fhir_vs&filter=...`, which all
   of them support. A down server degrades to empty results, never errors.
2. **Per tenant**: set `snomedEnabled: true` in the tenant's `settings` JSON
   for organizations whose country/affiliate license covers them (India is a
   member country — the national license is free). Without it, SNOMED search
   and suggestions refuse for that tenant and the dictionary shows why.

`GET /api/terminology/systems` reports each system's availability + reason;
the dictionary's search UI reflects it verbatim.

## What the suggestion pass codes with what

- **Fields** (questions) get **LOINC** candidates — observations, vitals,
  scores are LOINC's home turf.
- **Enum answer options** get **SNOMED** candidates (qualitative concepts) —
  only when the tenant's SNOMED gate is open. Option suggestions write
  `optionCoding[<code>]` and appear nested in the dictionary like any other
  option binding.
- **ICD-10** is manual-search only for now: diagnosis-shaped fields are a
  judgment call the reviewer makes with the search box.

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
