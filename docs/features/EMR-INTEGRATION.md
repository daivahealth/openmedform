---
publish: true
description: "Embedding OpenMedForm renderers inside an existing EMR or EHR product."
---

# EMR Integration

OpenMedForm integrates with external EMR/HIS systems through a JSON export/import model and an npm renderer package. The design ensures **no PII/PHI flows to OpenMedForm** — EMRs render forms in their own frontend using their own patient data.

## Integration Model

```
┌──────────────┐    JSON Export     ┌──────────────┐
│  OpenMedForm │ ────────────────►  │   EMR/HIS    │
│  (Designer)  │    Form Template   │  (Consumer)   │
└──────────────┘                    └──────┬───────┘
                                           │
                                    npm install
                                    @openmedform/renderer
                                           │
                                    ┌──────▼───────┐
                                    │  EMR Frontend │
                                    │  renders form │
                                    │  with patient │
                                    │  context from │
                                    │  own systems  │
                                    └──────────────┘
```

1. **Design** — Form designers create and publish forms in OpenMedForm
2. **Export** — Published forms are exported as JSON templates
3. **Import** — EMR imports the JSON template into its own system
4. **Install** — EMR installs `@openmedform/renderer` npm package
5. **Render** — EMR frontend renders the form, passing patient context from its own patient data
6. **Store** — EMR stores submission data in its own database
7. **Show history** — for forms filled repeatedly (q2h vitals), the EMR hands the renderer the
   patient's earlier fills and gets previous-value chips and a flowsheet back

OpenMedForm never receives patient data from EMRs.

## Form Template Export

`GET /api/forms/:id/export` returns a JSON envelope:

```json
{
  "openmedform": "1.0",
  "exportedAt": "2026-06-19T...",
  "form": {
    "name": "VTE Risk Assessment",
    "description": "...",
    "category": "Clinical Assessment",
    "formType": "PATIENT",
    "tags": ["vte", "risk"]
  },
  "schema": { },
  "scoringRules": { },
  "patientContextFields": ["patientName", "patientMrn", "age", "gender", "encounterId"]
}
```

- Only works on `PUBLISHED` forms
- `patientContextFields` tells the EMR which patient fields the form expects
- `formType: "NON_PATIENT"` forms have an empty `patientContextFields` array

## Form Template Import

`POST /api/forms/import` accepts a template JSON and creates a new `DRAFT` form with version 1 containing the imported schema. Slug conflicts are resolved by appending a timestamp suffix.

## Renderer Package

`@openmedform/renderer` is an npm package EMRs install to render OpenMedForm form schemas in their own React frontend.

### Installation

```bash
npm install @openmedform/renderer
```

Peer dependencies: `react` >= 18, `react-dom` >= 18.

### Usage

```tsx
import { FormRenderer } from '@openmedform/renderer';

<FormRenderer
  schema={template.schema}
  scoringRules={template.scoringRules}
  patientContext={{ patientName: 'John Doe', patientMrn: 'MRN-001' }}
  onSubmit={(result) => {
    // result.data — form field values
    // result.scores — calculated scores
    // result.riskLevel — risk classification
  }}
/>
```

### What the renderer handles

- Registers all custom clinical components (ScoringMatrix, ColorCodedGrid, RiskStratification, SignatureDate, ClinicalReferenceTable)
- Ships its own scoped styles from the shared design tokens — no global CSS to conflict with the EMR's own
- Client-side score calculation on submit
- Optional patient header bar when `patientContext` is provided
- Read-only mode for viewing completed submissions

### Standalone scoring

```typescript
import { calculateScores } from '@openmedform/renderer';

const result = calculateScores(template.scoringRules, submissionData);
// result.scores, result.riskLevel
```

See `packages/renderer/README.md` for full API reference.

## Observation History

A clinical form is often filled repeatedly for one patient. The renderers can show each field's
**previous values** while the clinician charts the new one, and draw a **flowsheet** of the day —
without OpenMedForm ever seeing the data. The EMR supplies the history, either as the prior fills
it already has (`history`) or by answering per-field lookups from its own store or FHIR server
(`historyProvider`); the renderer aligns readings to the current form by LOINC/SNOMED binding first,
data path second, so readings taken against an older version of the form still line up.

```tsx
<FormRenderer definition={template} data={data} onChange={setData}
  history={priorFills}                 // [{ effectiveAt, data, definition?, author? }]
  historyProvider={lookupObservations} // ({ coding?, path, limit }) => Promise<Observation[]>
/>
<Flowsheet definition={template} entries={priorFills} />
```

Which fields show history is set in the form definition (`omf.history` on the field), so it is the
same in every EMR. `renderFlowsheetHtml()` from `@openmedform/form-print-engine` prints the same
grid as an A4 landscape sheet. At save time the EMR can flatten a response into coded, FHIR-shaped observation
rows with `projectObservations()` from `@openmedform/form-core` (`toFhirObservation()` for a FHIR
store), so both ends of the flow share one shape. Details, the FHIR search mapping and the record-shape
guidance are in [Observation History in your EMR/EHR](../integration/OBSERVATION-HISTORY.md).

## Print / PDF

The same exported JSON also produces a **print-accurate A4 document** — for a paper copy in-app or a
server-generated PDF — via `@openmedform/form-print-engine` (`renderPrintHtml(definition, { data })`).
The engine is framework-agnostic (browser, Node, React, Angular) and does not bundle a rasterizer, so
you choose your own (Playwright/Chromium or WeasyPrint) for PDF. Conditional sections are honoured:
printing **with** `data` omits a section the response never triggered, printing a blank form keeps
every section so it can be filled in by hand
([details](../integration/THIRD-PARTY-GUIDE.md#the-one-function-you-need)). In the OpenMedForm app a **Print
preview** button is available on the form Preview and Fill screens (JSON Forms engine). Full snippets
(browser print preview + server-side PDF) are in the
[Third-Party Integration Guide §6](../integration/THIRD-PARTY-GUIDE.md#6-print--pdf-optional).

## Package Architecture

```
packages/
├── renderer/          # @openmedform/renderer — React component for EMRs
└── form-core/         # framework-independent validation, scoring and binding
```

Scoring runs in two places from one implementation: `packages/form-core` derives the live on-screen total that both renderers display, and the API recalculates authoritatively on submission. The API keeps a self-contained scoring service to avoid ESM/CJS resolution issues in the NestJS runtime — client-side totals are advisory, the server's are stored.
