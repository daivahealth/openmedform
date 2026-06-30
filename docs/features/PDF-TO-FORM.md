# PDF to Form Conversion

OpenMedForm can convert paper-based clinical forms (PDFs) into digital formio.js forms using AI.

## How It Works

1. User uploads a PDF of a clinical form (assessment, checklist, intake form, etc.)
2. The system extracts text from the PDF using `pdf-parse`
3. When available, the backend renders the first PDF pages to PNG images with `pdftoppm`
4. If the selected AI provider supports image input, the page images are sent with extracted text for layout-aware analysis
5. The LLM analyzes the form structure and generates a Form.io JSON schema using OpenMedForm clinical components where appropriate
6. The backend renders a lightweight PNG preview of the generated schema
7. A visual QA pass compares the source PDF page image with the generated preview image and can return a repaired schema
8. The final schema is assembled and validated; invalid schemas are rejected
9. A new DRAFT form is created through the form service with version 1 containing the generated schema
10. The user is redirected to the form builder to review and refine the generated form with chat

## API

Preferred endpoint:

`POST /api/forms/from-file` — multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | PDF/image file | Yes | Clinical form PDF, PNG, JPEG, WebP, or GIF (max 10 MB) |
| `name` | string | Yes | Name of the draft form to create |
| `description` | string | No | Form description |
| `category` | string | No | Form category |
| `formType` | string | No | `PATIENT` or `NON_PATIENT`; defaults to `PATIENT` |
| `provider` | string | No | AI provider name (uses default if omitted) |
| `instructions` | string | No | Additional instructions for the conversion |

Returns `{ form, schema, provider }` — the created draft form, generated Form.io schema, and provider used.

Low-level compatibility endpoint:

`POST /api/forms/from-pdf` remains as a compatibility alias.

`POST /api/ai/generate-from-pdf` returns `{ schema, provider }` without creating a form. Product UI should prefer `/api/forms/from-file` so tenant scoping, draft creation, and version lifecycle stay server-side.

## Vision Support

When `pdftoppm` is available, the backend renders the first pages of the PDF to PNG and sends those images alongside extracted text to providers with image input support. This gives the LLM access to visual layout (tables, checkboxes, scoring grids) in addition to text content.

Providers with page-image vision support:
- **Claude**
- **OpenAI**

Providers using text-only fallback:
- **Ollama**, **Minimax**, **Kimi** — uses extracted text only

Deployment note: install Poppler (`pdftoppm`) in API runtime images to enable page-image vision. Without it, OpenMedForm falls back to embedded text extraction.

## Clinical Component Mapping

- Vital sign observation charts, EWS/NEWS charts, and standard ward multi-parameter logs should map to the custom `vitalSignsChart` component.
- Static EWS/NEWS reference ranges and escalation protocols should map to `clinicalReferenceTable` and static instruction components.
- Patient header fields in PDFs are ignored by default because OpenMedForm supplies patient context outside the form schema.

## Visual QA Repair Pass

After initial schema generation, the backend creates a server-side PNG preview of the generated schema and sends it to the vision provider alongside the source PDF page image. The model compares both images and returns a complete corrected schema when it detects structural mismatches. The repair pass is fail-open: if the comparison call fails or returns invalid JSON/schema, OpenMedForm keeps the initial validated schema rather than blocking draft creation.

## Specialized Prompt

The PDF-to-form prompt (`prompts/pdf-to-form-prompt.ts`) is specialized for clinical form digitization. It instructs the LLM to:

- Identify form sections, field types, and scoring logic
- Map paper form elements to appropriate formio.js components
- Use custom clinical components (ScoringMatrix, RiskStratification, etc.) when scoring patterns are detected
- Derive camelCase keys from field labels
- Preserve the original form's structure and grouping

## UI Flow

The forms page has a "From File" button that opens a dialog with two steps:

1. **Upload** — select a PDF, enter form metadata, optionally add agent instructions and select a provider
2. **Processing** — backend extracts the PDF, generates a schema, validates it, creates a draft, and redirects to the builder

The form is created as a DRAFT with the AI-generated schema pre-loaded in the builder for review. Further changes should use the builder's AI chat, which calls `POST /api/forms/:id/ai/refine` and returns proposed schema updates for the user to apply.

## Limitations

- Scanned PDFs with only images require page-image rendering plus a vision-capable provider. Text-only providers need embedded text or future OCR support.
- Complex multi-page forms may exceed token limits for some providers.
- Generated schemas should always be reviewed in the builder before publishing — AI output is a starting point, not a final form.
