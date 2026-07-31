# PDF to Form Conversion

OpenMedForm can convert paper-based clinical forms (PDFs) into digital formio.js forms using AI.

Source files also include images and — for the jsonforms engine — **HTML
mock-ups** (see [HTML mock-ups](#html-mock-ups-jsonforms-engine) below, which
covers the mapping, the security model, and the size limits).

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

The Data Schema must compile under Ajv or the job fails. One common LLM slip —
a local `$ref` to a `$defs` entry it never defined (e.g. `#/$defs/age`) — would
otherwise reject the whole schema; the assembler instead **strips the dangling
`$ref`** (the field then validates permissively, keeping any sibling keywords)
and records an `UNCERTAIN_FIELD_BINDING` warning so the reviewer can tighten it,
so one bad reference no longer sinks an otherwise-complete conversion.

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

## HTML mock-ups (jsonforms engine)

`POST /api/conversions` also accepts an **HTML mock-up** (`text/html`) — the kind
an author now commonly produces with an LLM before building the real form. HTML
is *structurally richer* than a PDF for this purpose: a PDF needs vision to infer
layout, whereas HTML declares it, so conversion runs **text-only** and still
recovers grouping and tables reliably. Mapping:

| Source markup | Produces |
|---|---|
| `<fieldset>`/`<legend>`, `<section>` + heading | a `Group` labelled with that heading |
| `<table>` of label rows × repeated columns | `checklistMatrix` (rows/columns from `<th>`/`<td>`) |
| `<table>` with a `<thead>` | `OmfTableLayout` + `options.omf.columns` (a real grid) |
| left-label / right-value grid (no header row) | `OmfTableLayout` + `OmfTableRow` |
| `<input type="checkbox">` | a boolean `Control` |
| radio group / `<select>` | an enum `Control` (`omf.control: "radio"`) |
| `<label for=…>` / adjacent text | the dataSchema property `title` |
| colour utilities or inline colour (`bg-red-50`, `color:#c0392b`) | `options.omf.accentColor` |
| leading emoji in a heading | `options.omf.icon` |
| trailing number on a scored row | `options.omf.points` |

### Column tables

A source table that has a **header row** (an HTML `<thead>`, or a paper table
with a heading row like `Role | Name | Signature | Date`) converts to an
`OmfTableLayout` carrying `options.omf.columns`:

```jsonc
{ "type": "OmfTableLayout",
  "options": { "omf": { "columns": [
    { "label": "#", "width": "40px", "align": "center" }, { "label": "Item" },
    { "label": "Status", "width": "150px" }, { "label": "Date & Time" }
  ] } },
  "elements": [
    { "type": "OmfTableRow", "label": "1", "elements": [
      { "type": "Label", "text": "Ensure after care is discussed and organised" },
      { "type": "Control", "scope": "#/properties/aftercare/properties/item1Status" },
      { "type": "Control", "scope": "#/properties/aftercare/properties/item1At" }
    ] }
  ] }
```

The renderer then draws a **real grid**: a header row, and one cell per child
aligned under its column. A row's first column is the `OmfTableRow` `label` when
that cell is static text (`Doctor`, a row number); every other column is one
entry in `elements` — a `Label` for a static cell, a `Control` for an input.
`elements.length + (label ? 1 : 0)` must equal `columns.length`.

Cell controls **do not repeat their own label** — the column header already
names them — so a sign-off grid does not show "Name / Signature / Date" again in
every row. Source widths and alignment carry over, and a wide table scrolls
inside its own container instead of pushing the host page sideways.

Omitting `columns` keeps the two-cell **left-label** layout (shaded row label |
contents) used by grids without a header row.

### Security model

The upload is untrusted and is handled as **inert text only** — see
[`html-extract.ts`](../../apps/api/src/common/utils/html-extract.ts):

- **Never rendered or executed.** No headless browser is involved, so there is no
  script-execution surface.
- **No network access.** `src`/`href`/`srcset`/`@import` are *dropped rather than
  resolved*, so there is no SSRF (including cloud-metadata endpoints) and no
  `file://` read surface.
- **No XXE.** Parsed with a lenient HTML parser, never an XML parser.
- **Allow-list, not deny-list.** Only known-safe elements and attributes survive,
  so `on*` handlers, `formaction`, embeds and anything new are dropped by default.
  `class`/`style` are kept deliberately — they carry the section accent colours.
- **Hidden content is removed** (`display:none`, `visibility:hidden`, `hidden`,
  `aria-hidden`, `font-size:0`, Tailwind `hidden`, HTML comments). This is the
  natural place to smuggle instructions past the person uploading the file and
  into the LLM, so it is stripped — and the removal is reported as a conversion
  warning rather than happening silently. (`sr-only` is kept: it is real
  accessible text, not smuggled content.)
- The prompt additionally frames the markup as untrusted source material to be
  read for layout only.

Downstream, extracted strings only ever become JSON schema values: the React and
Angular renderers escape by default (no `innerHTML` anywhere) and the print
engine escapes explicitly, so this text never re-enters an HTML context.

### Sections built by JavaScript

Because the page is never executed, only what is **in the markup** can be
converted. Mock-ups generated by an LLM often render their option lists from a JS
array, leaving an empty container behind:

```html
<h3>Care Categories</h3>
<div class="hint">Select all categories that apply to this patient.</div>
<div class="multiselect" id="ms-comfort-categories"></div>
<script>/* fills #ms-comfort-categories at runtime */</script>
```

A heading and a hint next to an empty box is exactly where a model will invent a
plausible-looking control — in one real case an `Add to Care Categories` array
widget that appears nowhere on the source form. Two things prevent that:

- `extractFormHtml` runs `findScriptFilledPlaceholders()` **before** scripts are
  stripped and returns `scriptFilledPlaceholders` (named-but-empty containers in
  a document that ships scripts). They are reported as a conversion warning
  listing each container, so the reviewer knows to add those fields by hand. A
  document with no `<script>` never triggers this, so ordinary spacer `div`s in a
  static mock-up stay quiet.
- The prompt forbids inventing fields for an empty section — the heading is
  emitted as a `Label` plus a `POTENTIAL_MISSING_FIELD` warning — and restricts
  `type: "array"` to genuinely add/remove-able lists, so a "select all that
  apply" group becomes one boolean Control per option rather than an array.

To convert such a section, inline the options as real markup (or paste the
rendered DOM) before uploading.

### Size and complexity limits

One conversion pass has to emit the whole Data + UI + Print schema set, so the
binding constraint is the model's **output** budget, not the input file. Limits
are therefore enforced up front, and an oversized mock-up is **rejected with
guidance** rather than converted into a form that looks complete but silently
lost its later sections:

| Limit | Value | On breach |
|---|---|---|
| File size | 2 MB (vs 10 MB for PDF/images) | 400 with the actual size |
| Fields (inputs/selects/textareas) | 120 | 400 — "split into one file per section" |
| Table rows | 120 | 400 — "split the large tables" |
| No fields found | — | 400 — the file is not a form mock-up (or everything was hidden) |
| Cleaned markup | 24 000 chars | truncated + `POTENTIAL_MISSING_FIELD` warning |

The field/row limits and the conversion call's output budget
(`CONVERSION_MAX_TOKENS`, 32 768) **move together** — raising the field limit
alone would just trade a clear rejection for a silently truncated form. As a
backstop, if a model still runs out of budget mid-object the run is rejected
with *"the AI ran out of space … split it into one file per section"* rather
than the generic "not valid JSON", which would send the author looking for a
problem in their source file.

These thresholds are calibrated against the output budget rather than measured
per model, so they are the dial to turn if legitimate mock-ups start being
rejected.

HTML converts to the **jsonforms engine only**; the Form.io path takes PDFs and
images (400 otherwise). Multi-document files are flagged with a warning.

## Limitations

- Scanned PDFs with only images require page-image rendering plus a vision-capable provider. Text-only providers need embedded text or future OCR support.
- Complex multi-page forms may exceed token limits for some providers.
- Generated schemas should always be reviewed before publishing — AI output is a starting point, not a final form.
- The jsonforms conversion's structural quality depends on the LLM; confidence/warnings + the review loop are the mitigation, not a guarantee.
- HTML mock-ups must be a **single page**: one form per file. Anything past the field/row limits above is rejected rather than partially converted.
- Hidden HTML is never converted, by design. If a mock-up legitimately hides a section (e.g. a conditional block), make it visible before uploading — the conversion warning will say what was removed.
- Sections a mock-up builds with JavaScript are empty in the markup and cannot be recovered. They are named in a conversion warning and left as a labelled gap rather than guessed at — see [Sections built by JavaScript](#sections-built-by-javascript).
