# PDF to Form Conversion

OpenMedForm can convert paper-based clinical forms (PDFs) into digital formio.js forms using AI.

## How It Works

1. User uploads a PDF of a clinical form (assessment, checklist, intake form, etc.)
2. The system extracts text from the PDF using `pdf-parse`
3. When available, the backend renders up to the first four PDF pages to PNG images with `pdftoppm`
4. If the selected AI provider supports image input, the page images are sent with extracted text for source-driven, page-aware layout analysis
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

When `pdftoppm` is available, the backend renders up to the first four pages of the PDF to PNG and sends those images alongside extracted text to providers with image input support. This gives the LLM access to visual layout (tables, checkboxes, scoring grids) in addition to text content. The JSON Forms conversion treats each supplied page as its own visual reference: it uses parallel columns only when the source has them, and keeps wide tables, grids, and narrative areas full-width when the source does.

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

## Engine-Targeted Conversion Pipeline (Phase 6)

The direct `POST /api/forms/from-file` path above always targets the **Form.io**
engine. The **conversion pipeline** (`POST /api/conversions`) lets the author
choose the target engine and tracks the run as a `conversion_job`:

- `engine: "formio"` — reuses the Form.io generator described above.
- `engine: "jsonforms"` — emits the separated **Data / UI / Print** schemas +
  translations (see [ADR-003](../ADR/003-dual-engine-json-forms.md)) via a
  dedicated system prompt (`prompts/pdf-to-jsonforms-prompt.ts`). The Data Schema
  is verified to compile under Ajv 2020-12 before persisting. Its UI layout is
  inferred from the supplied source pages rather than a fixed clinical template;
  **per-field
  confidence and warnings** are stored in `conversion_warning` so uncertain
  elements are surfaced for review, never silently dropped.

Jobs run in the background (lightweight fire-and-forget — no external queue) and
transition PENDING → RUNNING → REVIEW \| FAILED; poll `GET /api/conversions/:id`.
A successful job creates a **draft form in REVIEW status** for the chosen engine;
`ai.convert` is audit-logged. The review/publish UI is Phase 7.

### Scored clinical checklists (colour-coded domain boxes)

Many clinical forms group tick-box risk factors into **coloured, icon-headed
domain boxes** where each row reads `<risk factor> …… <points>` (e.g. a VTE risk
assessment with AGE / CARDIOVASCULAR / SURGICAL boxes). The jsonforms conversion
reproduces these faithfully:

- Each domain box → a **`Group`** whose `label` is the box header, carrying
  `options.omf.accentColor` (a hex approximating the box's border/header colour),
  `options.omf.icon` (an emoji matching the box's pictogram, e.g. `❤️`), and
  `options.omf.pointLegend` (the distinct point values shown as header chips).
- Each row → a **boolean `Control`** whose Data Schema `title` is the exact
  source-language label, carrying `options.omf.points` (the printed point value).
  The renderer draws the checkbox on the left, the label, and a **colour-coded
  point badge** on the right (1→blue, 2→green, 3→amber, 5→red).

Every row is extracted as its own field — the prompt explicitly forbids emitting
an empty `scoringMatrix` (which would drop the risk factors). Saved data is a set
of clean booleans. A **YES/NO (or question-then-answer) row** where the paper
prints the options to the right of the label renders label-left / options-right:
set `options.omf.screen.labelPosition: "left"` (a two-option radio defaults to
this). The section icon belongs only in `options.omf.icon`, never also prepended
to the Group label (the renderer de-duplicates a doubled glyph defensively).

Nested groupings are preserved, not flattened: a heading that introduces an
indented sub-list (e.g. "Immobility … PLUS one or more of:" followed by its
dependent factors) becomes a nested `Group` with `options.omf.variant:
"subsection"` — an indented sub-heading with its items nested beneath it (no
box). A heading line with no options printed beside it is a `Label` or a
subsection heading and never receives its own input. The same `accentColor` / `icon` / `points` extensions render
identically in the React and Angular renderers via the shared design tokens and
point-value palette. These extensions live under `options.omf` in
[`packages/form-schema-types`](../../packages/form-schema-types/src/ui-schema.ts).

#### Periodic / reassessment matrix

A grid where each **row** is an item and each **column** a repeated period — e.g.
a *Nursing Diagnosis × Day 1–5* reassessment table with a checkbox in every cell —
is a single `omf.control: "checklistMatrix"` control (not dozens of scattered
booleans). Config rides on `options.omf.rows` / `options.omf.columns`
(`{ key, label }[]`); the control binds to an **object** property and stores a
nested value `{ [rowKey]: { [colKey]: true } }`. One compact control keeps the
conversion output small (which helps the model finish dense multi-page forms) and
renders the same scrollable grid in React and Angular.

#### Multi-page completeness

Conversion extracts **every section and option across all pages** — side-by-side
boxes (e.g. *Anticoagulant* + *SCD contraindications*, or *Mechanical* +
*Pharmacologic* orders) become a `HorizontalLayout` of two fully-populated Groups,
and long medication lists keep every row (with dose/qualifier text in the label).
A section that is only a header band on the paper is never emitted empty. Because
completeness on dense forms ultimately depends on the LLM, anything the model is
unsure it captured is surfaced as a `POTENTIAL_MISSING_FIELD` warning in review
rather than silently dropped — re-run or refine if a section still looks thin.

#### Total score & risk stratification

Many scored forms sum the ticked points across every box into a grand total and
map that total to a risk level. This is **data-driven and computed from a single
source of truth** — the `options.omf.points` on each checkbox:

- **Live, on screen (clinician aid):** each domain box header shows a running
  section subtotal (`Σ N`), and a `omf.control: "scoreSummary"` element shows the
  grand total, the per-section breakdown, and the risk band. The renderers derive
  this with `collectScoreItems` / `computeScore` from
  [`@openmedform/form-core`](../../packages/form-core/src/scoring/score.ts) as the
  clinician ticks boxes. Risk bands ride on the scoreSummary under
  `options.omf.bands` (`{ minScore?, maxScore?, label, color }`, both bounds
  inclusive).
- **Authoritative (stored):** at conversion (and again on every prompt-designer
  refine) the backend derives `form_version.scoring_rules` from the same
  `omf.points` — a `sum` rule over each scored field's data path, plus a
  `threshold` rule from the bands. On `POST /submissions/:id/complete` the
  `ScoringService` recomputes the total and risk level from the **saved** data and
  stores `submission.scores` / `submission.risk_level`. **Client totals are never
  trusted** (Form Engine Rules); the on-screen figure is display only.

Because the live aid and the stored rules both read the same `omf.points`, they
cannot drift — and re-deriving on refine keeps scoring correct when a reviewer
adds or removes scored items.

## Limitations

- Scanned PDFs with only images require page-image rendering plus a vision-capable provider. Text-only providers need embedded text or future OCR support.
- Complex multi-page forms may exceed token limits for some providers.
- Generated schemas should always be reviewed before publishing — AI output is a starting point, not a final form.
- The jsonforms conversion's structural quality depends on the LLM; confidence/warnings + the review loop are the mitigation, not a guarantee.
