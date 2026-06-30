# Form Types

OpenMedForm supports two form types that control patient context behavior during form filling.

## Types

### Patient Form (`PATIENT`)

Default type. Used for clinical assessments tied to a patient encounter (e.g., VTE Risk Assessment, Fall Risk, Pain Assessment).

- Fill page shows a patient context pre-screen before the form renders
- Patient context fields: Name, MRN, Encounter ID, Age, Gender, Department, Consultant
- All fields are optional (users manually enter what they have)
- A patient header bar displays above the form during filling
- `patientContext` is stored as JSON on the submission record

### Non-Patient Form (`NON_PATIENT`)

Used for forms not tied to a specific patient (e.g., OT Checklists, departmental audits, equipment checks).

- Fill page skips the patient context pre-screen entirely
- Submission starts immediately when the page loads
- No patient header bar is shown

## Database

The `form` table has a `form_type` column (`FormType` enum: `PATIENT`, `NON_PATIENT`, default `PATIENT`).

The `submission` table has a `patient_context` JSONB column that stores the full patient context object for patient forms.

Existing flat fields `patient_mrn` and `encounter_id` on submission are backfilled from `patientContext` for backward compatibility.

## API

- `POST /api/forms` — accepts optional `formType` field (default `PATIENT`)
- `PUT /api/forms/:id` — accepts optional `formType` field
- `POST /api/forms/:id/clone` — preserves `formType` from source form
- `POST /api/submissions` — accepts optional `patientContext` object

## UI Behavior

- **Create Form dialog**: two card-style buttons to select form type
- **Forms list**: badge showing "Patient" (default) or "Non-Patient" (secondary)
- **Fill page**: conditional pre-screen based on `formType`
- **Submissions page**: "New Submission" button opens a form picker dialog listing published forms with type badges
