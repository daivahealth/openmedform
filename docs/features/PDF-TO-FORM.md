# PDF to Form Conversion

OpenMedForm converts paper-based clinical forms — PDFs, images, and HTML
mock-ups — into JSON Forms definitions using AI.

Source files also include images and — for the jsonforms engine — **HTML
mock-ups** (see [HTML mock-ups](#html-mock-ups-jsonforms-engine) below, which
covers the mapping, the security model, and the size limits).

## How It Works

1. The author uploads a PDF, image, or HTML mock-up of a clinical form
2. For a PDF, the backend extracts embedded text (`pdf-parse`) and, when
   `pdftoppm` is available, renders up to the first four pages to PNG
3. If the selected provider supports image input, those page images go to the
   model alongside the extracted text, so layout (tables, tick boxes, scoring
   grids) is read visually rather than guessed from text order
4. For an HTML mock-up, the markup is cleaned to inert semantic HTML — see
   [HTML mock-ups](#html-mock-ups) below
5. The model emits the separated **Data / UI / Print** schemas plus translations
6. The Data Schema is compile-checked under Ajv 2020-12; per-field confidence and
   warnings are recorded
7. A draft form is created in `REVIEW` status and the author reviews it, refines
   by prompt, and publishes

## API

`POST /api/conversions` — multipart/form-data

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| `file` | PDF / image / HTML | Yes | PDF, PNG, JPEG, WebP, GIF (max 10 MB) or HTML (max 2 MB) |
| `provider` | string | No | AI provider name (uses the tenant default if omitted) |
| `instructions` | string | No | Extra instructions for the conversion |

Returns the created `conversion_job`; poll `GET /api/conversions/:id` for
`PENDING → RUNNING → REVIEW | FAILED`. On success the job carries the `formId`
of the draft. `POST /api/conversions/:id/accept` promotes it `REVIEW → DRAFT`.

To create a form with **no source document**, describe it instead:
`POST /api/forms/from-prompt` with `{ name, prompt, category? }`. It runs the
same generator and assembler, synchronously, and returns the draft form.

## Vision Support

When `pdftoppm` is available, the backend renders up to the first four pages of
the PDF to PNG and sends those images alongside extracted text to providers with
image-input support. Each supplied page acts as its own visual reference: the
conversion uses parallel columns only where the source has them, and keeps wide
tables, grids and narrative areas full-width where the source does.

Providers with page-image vision support: **Claude**, **OpenAI**.
Text-only fallback: **Ollama**, **Minimax**, **Kimi**.

Deployment note: install Poppler (`pdftoppm`) in API runtime images to enable
page-image vision. Without it, conversion falls back to embedded text.

## Clinical Component Mapping

- Observation charts, EWS/NEWS charts and ward multi-parameter logs map to
  `vitalSignsChart`
- Static EWS/NEWS reference ranges and escalation protocols map to
  `clinicalReferenceTable` and static `Label` elements
- Patient-identity header fields are ignored by default — patient context is
  supplied outside the form schema

## Specialized Prompt

`prompts/pdf-to-jsonforms-prompt.ts` is specialized for clinical form
digitization. It instructs the model to identify sections, field types and
scoring logic; map paper elements to the `omf` control vocabulary; derive
camelCase keys from labels; keep the source-language label text verbatim; and
surface anything uncertain as a warning rather than dropping it.

## UI Flow

The forms list has **From File** (upload a PDF/image/HTML) and **From Prompt**
(describe the form). Both create a draft and open it on the preview page, where
"Refine with AI" edits it and "Publish" makes it available for data entry. There
is no drag-and-drop builder — see
[ADR-004](../ADR/004-remove-formio-engine.md).

## Conversion Pipeline

Each run is tracked as a `conversion_job`. The pipeline emits the separated
**Data / UI / Print** schemas + translations via a dedicated system prompt
(`prompts/pdf-to-jsonforms-prompt.ts`). The Data Schema is verified to compile
under Ajv 2020-12 before persisting. The UI layout is inferred from the supplied
source pages rather than a fixed clinical template, and **per-field confidence
and warnings** are stored in `conversion_warning` so uncertain elements are
surfaced for review, never silently dropped.

Jobs run in the background (lightweight fire-and-forget — no external queue) and
transition PENDING → RUNNING → REVIEW \| FAILED; poll `GET /api/conversions/:id`.
A successful job creates a **draft form in REVIEW status**; `ai.convert` is
audit-logged.

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

## HTML mock-ups

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
  accessible text, not smuggled content.) One narrow exception is carved out for
  genuinely conditional fields — see
  [Conditional fields](#conditional-other--please-specify-fields) for the exact
  shape and why it carries no smuggling surface.
- The prompt additionally frames the markup as untrusted source material to be
  read for layout only.

Downstream, extracted strings only ever become JSON schema values: the React and
Angular renderers escape by default (no `innerHTML` anywhere) and the print
engine escapes explicitly, so this text never re-enters an HTML context.

### Sections built by JavaScript

Only what is **in the markup** can be converted by the static path. (A mock-up
that builds its form at load is rendered first — see [Mock-ups that build their
form with JavaScript](#mock-ups-that-build-their-form-with-javascript) — but a
container nothing ever fills stays empty either way.) Mock-ups generated by an LLM often render their option lists from a JS
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

### Repeating logs (`recordTable`)

Not every empty container is a lost cause. The common clinical counterpart is a
table the user **adds rows to**, where the row is only a summary and the record's
real fields live behind it — a treatment day, a medication round, an observation
entry. In a mock-up it looks like this:

```html
<div class="label-tag">0 treatment days logged this month</div>
<button onclick="cx_addSession()">+ Add treatment day</button>
<table>
  <thead><tr><th>Day</th><th>Date</th><th>Cycle / Day#</th>…</tr></thead>
  <tbody id="cx_tbody"></tbody>   <!-- filled by script -->
</table>
```

The `<tbody>` is empty for exactly the same reason as a JS-built section, but
this one **is recoverable**: the `<thead>` names every column and the button
names the thing being added. `findRepeatingTables()` picks that up before scripts
are stripped and returns the columns, the add label and the count line, which the
conversion prompt passes to the model verbatim. An empty `<tbody>` under a
populated `<thead>` is therefore *excluded* from `scriptFilledPlaceholders` —
warning about it would throw away a whole treatment-day log.

A repeating log requires an add affordance (`Add …` / `New …`); a print-only grid
with an empty body and no button is left as a plain table, since a clinician
fills that by hand.

It converts to a single array Control:

```jsonc
{
  "type": "Control",
  "scope": "#/properties/treatmentDays",
  "options": {
    "omf": {
      "control": "recordTable",
      "recordTable": {
        "addLabel": "+ Add treatment day",
        "countLabel": "{n} treatment day{s} logged this month",
        "emptyLabel": "No treatment days logged for this month yet.",
        "columns": [
          { "label": "Date", "path": "date" },
          { "label": "Cycle / Day#", "path": "timelog.cycle", "pairWith": "timelog.dayNum" },
          { "label": "Adverse events", "countOf": "adverseEvents", "align": "center" }
        ]
      }
    },
    "detail": { "type": "OmfTabsLayout", "elements": [ /* one Group per stage */ ] }
  }
}
```

- `columns[].path` is a dot path **inside one record**; `pairWith` renders a
  combined `A / B` header, and `countOf` counts a nested array.
- `countLabel` substitutes `{n}` for the count and `{s}` for the plural `s`.
- `options.detail` is the standard JSON Forms per-item UI schema. Use an
  `OmfTabsLayout` when a record has more than ~15 fields — the source
  Chemotherapy Monitoring record has around 100 across eight stages, and one
  scrolling panel is unusable at the bedside.
- Record tables **nest**: a treatment day's Drug Administration tab is itself a
  `recordTable` over `drugs`, and the parent's "Drugs" column counts it.

Both renderers implement this identically, and the summary-cell derivation lives
once in `@openmedform/form-core`
([`record-table/summary.ts`](../../packages/form-core/src/record-table/summary.ts))
rather than being duplicated per framework — a log that showed a different date
or adverse-event count in the EMR than in the web preview would be a clinical
safety problem, not a cosmetic one.

**An array can no longer fall through to the stock list widget.** Any
array-of-objects control without `omf` config still renders as a record table,
with summary columns derived from the leading scalar properties of the item
schema. A derived table is imperfect; the stock *"Add to … / Items / Valid / No
data"* widget is unusable on a clinical form, so it is now unreachable in both
renderers.

### Matrix (transposed) tables

The other way a repeating record gets drawn: **fields down the side, record
instances across the top.** The NH VIP cannula chart is the canonical case —

```
| Parameter               | Cannula 1  [+ Day] |
| Date of Insertion       | …                  |
| Site                    | …                  |
| Size of Cannula (Gauge) | …                  |
```

This is the transpose of a [repeating log](#repeating-logs-recordtable), and it
converts to the same thing: **one `recordTable`**. The row labels are the item
schema's fields; each column heading is an instance of it.

`findTransposedMatrices()` recognises the shape — a header row of 2+ cells over
body rows whose first cell is plain label text — and passes the model the full
row-label list, the instance headings, and both add-controls. Without that hint
the model reliably fails in three ways at once, all observed on the real VIP
form: it turns "Cannula 1" into a column, drops the per-instance fields, and
leaves the nested day-group unconfigured.

An **instance name** is never a field and never a column. "Cannula 1",
"Patient 2", "Visit A" identify *which record you are looking at*.

A `+ …` control inside a column heading (the chart's `+ Day`) means each record
carries **its own nested repeating group**, so the item schema gets a nested
array with its own `recordTable` config.

The detector deliberately ignores: tables whose first column also holds inputs
(an ordinary data grid), tables with no inputs at all (a score legend or dosing
reference), and anything under three rows.

#### Rows are edited in place

A summary column that names **one concrete field** renders that field's real
control in the cell — date picker, select, number — so a row is filled in
exactly as on the source grid. Derived columns stay read-only text, because they
have no single value to write back: `countOf` counts a nested array, `pairWith`
merges two fields into one cell.

Two consequences worth knowing:

- **The actions column is pinned.** A converted chart can run to ten columns and
  scroll sideways. If `Open` / remove scroll out of view, a row becomes not just
  hard to edit but impossible to delete — there is no other affordance.
- **`Open` is hidden when there is nothing behind it.** If every field of the
  record is already a column — a blood-sugar row, say — a detail panel would be
  empty, so the button is omitted. Records with more fields than columns keep
  it, and the detail panel remains the place for the rest.

This is what makes a nine-column observation chart usable: all nine cells are
live, and the row still deletes. A treatment day with ~100 fields keeps its
tabbed panel; only its handful of summary columns are inline.

#### Column orientation

Set `omf.recordTable.orientation: "columns"` to render records the way the paper
draws them — field labels down the left, one column per record, growing
sideways — with `instanceLabel` supplying the noun:

```jsonc
"recordTable": {
  "orientation": "columns",
  "instanceLabel": "Cannula",     // heads each column: "Cannula 1", "Cannula 2"
  "addLabel": "+ Add Cannula"
}
```

Both orientations store **identical data**; this is purely a fidelity choice.
Default is `rows`, which suits a chronological log that grows downward. Use
`columns` when the source compares instances side by side. The expanded detail
panel still spans the full width in either mode, because a record's whole field
set never fits in one column.

### Mock-ups that build their form with JavaScript

An LLM-generated mock-up routinely builds its form at runtime from a config
array. The real NH Visual Infusion Phlebitis (VIP) form is the extreme case —
its entire markup is:

```html
<table id="tbl-vip">
  <thead><tr id="vip-head-row"><th>Parameter</th></tr></thead>
  <tbody id="vip-body"></tbody>
</table>
```

`addCannula()` builds 22 rows and 23 fields at load. Statically there is nothing
to convert.

**Conversion renders these itself.** A mock-up is executed in a sandboxed
headless browser, and the resulting DOM read instead, in two cases:

1. it ships scripts *and* either has no fields at all or contains
   named-but-empty containers — the case below; or
2. its markup yields no repeating structure but it names an "Add …" control, in
   which case the render exists to measure the layout — see
   [Grids built without tables](#grids-built-without-tables).

See [`html-render.ts`](../../apps/api/src/common/utils/html-render.ts).

Rendering is **not** trusting:

- **Chromium's own OS-level sandbox** contains the page. Uploaded script is
  never evaluated in the API process. (jsdom was rejected for exactly this: it
  would run untrusted code inside Node.)
- **No network.** The context is `offline` *and* every request is aborted by a
  catch-all route, and content is injected with `setContent` rather than
  navigated to — so there is no origin to fetch from. Verified against a hostile
  page attempting `169.254.169.254` metadata, `file:///etc/passwd` and an
  external exfil URL: all three blocked, nothing leaked into the DOM.
- **Bounded.** 30s wall-clock cap (it must cover a cold browser launch, not
  just the page), downloads refused, pop-ups closed unread,
  context always torn down. A `while(true)` script costs one timeout and the
  renderer returns null.
- **The output is re-sanitised.** The rendered DOM goes back through the same
  `extractFormHtml`: scripts stripped, attribute allow-list enforced, hidden
  content removed. Rendering widens what can be *read*, never what reaches the
  model.

Rendering is optional. If no browser is installed, or `HTML_RENDER_DISABLED=1`
is set, conversion falls back to the static markup — and the rejection **says
which** happened, because the advice differs completely:

| Message | Cause | Who fixes it |
|---|---|---|
| "no headless browser is available in this deployment" | Chromium missing — a bare `npm run start:dev`, or an image built before it was added | **Operator**: rebuild the API image, or set `CHROMIUM_PATH` |
| "automatic rendering is switched off (`HTML_RENDER_DISABLED=1`)" | Deliberately disabled | Operator, if unintended |
| "rendered but produced no form fields" | The page ran and genuinely built nothing at load | Author: the form may need a click first |

The first is an installation problem, not a problem with the uploaded file, and
the message says so. The server also logs a warning once per process when a
render is needed and no browser can be launched. Local dev and CI need no Chromium; the API image
installs the Alpine `chromium` package and points `playwright-core` at it via
`CHROMIUM_PATH`.

A render only replaces the static read when it recovers **more** fields, so a
script that errors halfway cannot lose content that was already readable. When
it does help, a conversion warning records how many fields it recovered.

#### What this does and does not fix

Measured against three real mock-ups:

| Mock-up | Static | Rendered | Outcome |
|---|---|---|---|
| VIP (entire form script-built) | 0 fields | **21 fields** | recovered; converts normally |
| Comfort Care (empty named containers) | 25 fields | 25 fields | unchanged — see below |
| Chemotherapy Monitoring (repeating log) | 6 fields | not rendered | handled by [Repeating logs](#repeating-logs-recordtable) |

**Comfort Care does not improve, and should not.** Its script contains no
reference to `#ms-comfort-categories` or `#comfort-care-body` at all — that
section's markup was pasted in without its builder code, so there is nothing to
render. The
[Sections built by JavaScript](#sections-built-by-javascript) warning remains
the correct outcome: an acknowledged gap rather than an invented control.

**Chemotherapy Monitoring is deliberately not rendered.** It has readable static
fields and a recoverable repeating table, so it does not meet the render
trigger. Rendering it would produce one cannula's worth of inputs as a flat
table and lose the add/remove semantics that `recordTable` reconstructs from the
`<thead>` and the "+ Add Cannula" button.

Two things still worth checking after a render:

- **Conditional fields.** A "Please specify…" input that only appears when a
  select is set to "Other" is kept and converted with a SHOW rule — VIP yields
  all 23 fields. Any *other* `display:none` content is still stripped, so a
  conditional block that does not match that pattern must be revealed before
  upload. See [Conditional fields](#conditional-other--please-specify-fields).
- **Row count.** A repeating table renders however many rows the script created
  on load, which is normally the one representative row you want.

### Conditional "Other → Please specify…" fields

Hidden content is stripped because it is the natural prompt-injection channel.
But mock-ups also use `display:none` for real fields:

```html
<select>
  <option>Forearm</option>
  <option>Other</option>
</select>
<input type="text" placeholder="Please specify…" style="display:none">
```

That input is genuine data capture — the VIP chart has two of them, and stripping
them cost it 2 of its 23 fields. The platform already renders conditional
visibility (`form-core` evaluates JSON Forms rules), so the fix is to emit the
rule rather than to keep or drop the field blindly.

`findConditionalFields()` runs **before** the hidden-content strip, spares the
field, and passes the model the pair. The converted Control carries:

```jsonc
{
  "type": "Control",
  "scope": "#/properties/siteOther",
  "rule": {
    "effect": "SHOW",
    "condition": { "scope": "#/properties/site", "schema": { "const": "OTHER" } }
  }
}
```

The `const` is the enum **code** the controlling property stores, not its display
label. A conditionally-shown field is never put in `required` — it is absent
whenever the condition is false.

**Why this does not reopen the injection channel.** What gets spared is
deliberately tiny:

| Spared | Still stripped |
|---|---|
| `<input>` of a text-entry type | checkbox, radio, `type="hidden"` |
| an **empty** `<textarea>` | a `<textarea>` with content (it is not void — content is prose in disguise) |
| the field alone | any container, and the field too if a hidden **ancestor** is removed |
| beside a `<select>` offering "Other"/"Others"/"Other (…)" | a hidden field with no such partner |
| within that select's own parent | anything further away |

The only string a hidden element can newly put in front of the model is its own
label (placeholder / aria-label / title / name), capped at 60 characters — far
too small to hide an instruction, and the same class of string every visible
field already contributes. Every adversarial case above is covered by a test in
`html-extract.test.ts`.

Both renderers honour the rule. React reads JSON Forms' `visible` prop
throughout; the Angular renderer's controls read `hidden`, and its layouts, Label
and score summary get the same treatment from `RuleAwareRenderer`, which
evaluates the rule with the **same** `form-core` code the server uses.

### Grids built without tables

Everything above depends on `<table>` markup. A mock-up that draws the same
chart with `<div>`s and CSS grid is, to a markup parser, an undifferentiated pile
of boxes — and AI-generated mock-ups increasingly draw them that way.

So detection does not rely on markup shape. The sandbox that already renders a
page also reports **where every label, control and button landed** — kind, own
text, and a scroll-adjusted bounding box — and
[`layout-detect.ts`](../../apps/api/src/common/utils/layout-detect.ts) clusters
those boxes by y-coordinate into rows and by x-coordinate into columns. Where a
pixel sits does not care how the pixel got there, so the same shapes surface
whether the grid was a `<table>`, CSS grid, flexbox or absolute positioning.

The discriminator between the two shapes is **what sits in the leftmost column
below the header**: static labels mean the fields run down the side and records
run across (a [matrix](#matrix-transposed-tables)); controls mean each row is
itself a record (a [repeating log](#repeating-logs-recordtable)).

The output is the *same* `RepeatingTableHint` / `TransposedMatrixHint` the markup
detectors produce, so the prompt, the assembler and the renderers are unchanged.

Guard rails:

- **Markup wins.** Geometry runs only where markup detection found nothing. A
  real `<table>` states the author's intent more precisely than a pixel cluster.
- **A render is only spent when it could change the outcome.** The "Add …"
  pre-check is the same precondition the detector applies, so a details panel
  with Save/Print buttons is never rendered.
- **No add affordance, no hint.** A print-only grid stays a plain set of fields.
- **Chromium is required.** Without it this path is skipped silently and
  detection is markup-only, exactly as before.

Verified on a CSS-grid rebuild of the VIP chart with no table markup at all: it
produces a matrix hint byte-identical to the one the markup detector returns for
the real `<table>` version — same `labelHeader`, same 22 `rowLabels`, same
`instanceHeaders`, same `+ Add Cannula` / `+ Day` controls.

The structure must be **visible at load**: a matrix behind a collapsed panel is
still missed, and group boundaries inside one long parameter column are still
inferred rather than measured.

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

Multi-document files are flagged with a warning.

## Limitations

> The full list — with severity, workarounds, and the tracked issue that closes
> each gap — lives in [CONVERSION-LIMITATIONS.md](CONVERSION-LIMITATIONS.md).
> Highlights:


- Scanned PDFs with only images require page-image rendering plus a vision-capable provider. Text-only providers need embedded text or future OCR support.
- Complex multi-page forms may exceed token limits for some providers.
- Generated schemas should always be reviewed before publishing — AI output is a starting point, not a final form.
- The jsonforms conversion's structural quality depends on the LLM; confidence/warnings + the review loop are the mitigation, not a guarantee.
- HTML mock-ups must be a **single page**: one form per file. Anything past the field/row limits above is rejected rather than partially converted.
- Hidden HTML is not converted, by design — with one narrow exception for a conditional "Please specify…" field beside an "Other" option, which is kept and given a SHOW rule. If a mock-up hides anything else (e.g. a whole conditional section), make it visible before uploading; the conversion warning will say what was removed.
- Sections a mock-up builds with JavaScript are empty in the markup and cannot be recovered. They are named in a conversion warning and left as a labelled gap rather than guessed at — see [Sections built by JavaScript](#sections-built-by-javascript). A repeating log is the exception: its `<thead>` and "Add …" button make it recoverable — see [Repeating logs](#repeating-logs-recordtable). If the *whole* form is script-built there is nothing to read at all and the upload is rejected with instructions — see [When the whole form is built by JavaScript](#when-the-whole-form-is-built-by-javascript).
