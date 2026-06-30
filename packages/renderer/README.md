# @openmedform/renderer

Render OpenMedForm form templates in any React application. This package is designed for EMR/HIS systems that want to integrate OpenMedForm clinical forms into their own frontend.

## Installation

```bash
npm install @openmedform/renderer
```

Peer dependencies: `react` >= 18, `react-dom` >= 18.

## Quick Start

```tsx
import { FormRenderer } from '@openmedform/renderer';
import type { FormTemplate, PatientContext, SubmissionResult } from '@openmedform/renderer';

// 1. Load the exported form template JSON
const template: FormTemplate = await fetch('/path/to/exported-template.json').then(r => r.json());

// 2. Build patient context from your EMR's patient data
const patientContext: PatientContext = {
  patientName: 'John Doe',
  patientMrn: 'MRN-001234',
  age: '45',
  gender: 'Male',
  encounterId: 'ENC-2024-001',
  department: 'Cardiology',
};

// 3. Render the form
function MyFormPage() {
  function handleSubmit(result: SubmissionResult) {
    // result.data — form field values
    // result.scores — calculated scores (if scoring rules present)
    // result.riskLevel — risk classification (if thresholds present)
    saveToEMR(result);
  }

  return (
    <FormRenderer
      schema={template.schema}
      scoringRules={template.scoringRules}
      patientContext={patientContext}
      onChange={(data) => autoSave(data)}
      onSubmit={handleSubmit}
    />
  );
}
```

## API

### `<FormRenderer />` Props

| Prop | Type | Required | Description |
|------|------|----------|-------------|
| `schema` | `Record<string, unknown>` | Yes | The formio JSON schema from the exported template |
| `scoringRules` | `Record<string, unknown>` | No | Scoring configuration for client-side score calculation |
| `patientContext` | `PatientContext` | No | Patient demographics shown in a header bar above the form |
| `submission` | `Record<string, unknown>` | No | Pre-fill the form with existing submission data |
| `onChange` | `(data) => void` | No | Called on every field change (for auto-save) |
| `onSubmit` | `(result: SubmissionResult) => void` | No | Called when the form is submitted, includes calculated scores |
| `readOnly` | `boolean` | No | Render in read-only mode (for viewing completed submissions) |

### `PatientContext`

```typescript
interface PatientContext {
  patientName?: string;
  patientMrn?: string;
  age?: string;
  gender?: string;
  encounterId?: string;
  encounterType?: string;
  department?: string;
  consultantName?: string;
  admissionDate?: string;
}
```

### `SubmissionResult`

```typescript
interface SubmissionResult {
  data: Record<string, unknown>;          // form field values
  scores: Record<string, number | string>; // calculated scores
  riskLevel?: string;                      // risk classification
}
```

### `calculateScores(rules, data)`

Standalone scoring function for server-side recalculation:

```typescript
import { calculateScores } from '@openmedform/renderer';

const result = calculateScores(template.scoringRules, submissionData);
// result.scores, result.riskLevel
```

## Form Template Format

Exported templates follow this structure:

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

- `patientContextFields` lists which patient fields the form expects — map these from your EMR's patient model.
- `formType: "PATIENT"` forms expect patient context; `"NON_PATIENT"` forms (checklists, audits) do not.

## CSS

The renderer automatically loads Bootstrap CSS (from CDN) and applies scoped overrides to avoid conflicting with your application's styles. No manual CSS setup needed.
