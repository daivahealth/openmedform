# Conversion — Known Limitations and Roadmap

What the AI conversion pipeline **cannot** do today, why each limit exists, what
to do about it right now, and the tracked issue that closes it. Companion to
[PDF-TO-FORM](PDF-TO-FORM.md), which describes what conversion *does*.

The design stance behind all of this: **deterministic where possible,
model-guided where not, graceful when both miss.** Structure the extractor can
prove (a repeating log's `<thead>`, a transposed matrix's label column) is
handed to the model as an explicit hint — every hinted shape has converted
reliably; every misconversion so far traces to a shape the detectors could not
see. So most rows below are, at heart, "a shape the detectors cannot see yet."

| # | Limitation | Severity | Workaround today | Fix tracked in |
|---|---|---|---|---|
| 1 | ~~Structure detection is `<table>`-only~~ — **fixed**: div/CSS-grid layouts are detected from rendered geometry | Resolved | — (requires Chromium; without it, markup-only detection as before) | [#72](https://github.com/daivahealth/openmedform/issues/72) ✅ |
| 2 | ~~PDFs and images get no structural hints~~ — **fixed**: a vision pre-pass reads the page's table structures and emits the same hints | Resolved | — (hints are read off the page, so they are a careful reading rather than a proof; HTML remains the most reliable source) | [#73](https://github.com/daivahealth/openmedform/issues/73) ✅ |
| 3 | ~~Hidden conditional fields are stripped~~ — **fixed**: "Other → Please specify…" now converts with a SHOW rule | Resolved | — (only the select-with-"Other" pattern is spared; other hidden content is still stripped) | [#74](https://github.com/daivahealth/openmedform/issues/74) ✅ |
| 4 | Scripted behaviour — **partly fixed**: declarative config (option lists, thresholds, reference tables) converts with an explicit opt-in; imperative behaviour still does not | Low | Tick "Read option lists from this mock-up's scripts"; add computed/enable-disable rules in the designer | [#75](https://github.com/daivahealth/openmedform/issues/75) ◐ |
| 5 | ~~Click-built content missed; matrix group-boundaries inferred~~ — **fixed**: a bounded sandbox probe presses add-controls and measures the split | Resolved | — (requires Chromium; `HTML_PROBE_DISABLED=1` reverts to a single read) | [#76](https://github.com/daivahealth/openmedform/issues/76) ✅ |
| 6 | Size caps: 120 fields / 120 table rows / 24k chars / 2 MB per HTML upload (defaults; deployment-configurable via `CONVERSION_MAX_*` env vars) | By design | Split into one file per section, or the operator raises the caps for capable providers | — |
| 7 | Fidelity is structural, not pixel-exact | By design | Print engine reconstructs A4 from the Print Schema | — |

## 1. Structure detection is `<table>`-only — resolved

**Was:** the detectors that make conversion reliable — `findRepeatingTables`
(records as rows) and `findTransposedMatrices` (records as columns) — walk
`<table>/<thead>/<tbody>` markup. A mock-up that draws the same grid with
`<div>`s and CSS grid/flexbox was invisible to them, and AI-generated mock-ups
increasingly do exactly that.

**Now** ([#72](https://github.com/daivahealth/openmedform/issues/72)): detection
no longer depends on markup shape. The sandboxed Chromium that already executes
mock-ups also reports **where every label, control and button landed**, and
`layout-detect.ts` clusters those boxes into rows and columns. Where a pixel
sits does not care how the pixel got there, so the same two shapes are found
whether the grid was a `<table>`, CSS grid, flexbox or absolute positioning —
and the output is the *same* `RepeatingTableHint` / `TransposedMatrixHint`, so
nothing downstream changed.

How it behaves:

- **Markup wins.** Geometry runs only when the markup detectors found nothing.
  A real `<table>` is the more precise statement of intent; clustering pixels
  could only blur it.
- **A render is only spent when it could change the outcome.** A script-free
  document is rendered for geometry only if it shows fields, yields no repeating
  structure, and names an "Add …" control — the same precondition the detector
  itself applies. A details panel with Save/Print buttons costs nothing.
- **No add affordance, no hint.** A print-only grid the clinician fills by hand
  stays a plain set of fields rather than becoming a record table.
- **Chromium is required for this path.** Without a browser, detection falls
  back to markup-only exactly as before — no error, just the old behaviour. See
  [ADR-003](../ADR/003-json-forms-platform.md) for the isolation model.

**Residual limits:** the structure must be *visible when the page loads* — a
matrix behind a collapsed panel is still missed (row 5), and group boundaries
within one long parameter column are still inferred rather than measured.

## 2. PDFs and images get no structural hints — resolved

**Was:** every structural hint came from HTML markup. A PDF or image went to the
model as page pictures plus text, with no repeating-log hint and no matrix hint,
so a scanned cannula-style matrix converted on prompt rules alone.

**Now** ([#73](https://github.com/daivahealth/openmedform/issues/73)): a narrow
vision pre-pass runs *before* the conversion and asks the pages one question —
what repeating table structures are on them? The reply is validated against a
strict shape and turned into the **same** `REPEATING LOG:` / `MATRIX TABLE:`
paragraphs the HTML detectors emit. See [Structure hints for PDFs and
images](PDF-TO-FORM.md#structure-hints-for-pdfs-and-images).

Measured on a PDF of the VIP cannula chart: the pre-pass read all 22 row labels
and the instance heading off the page image, matching what the HTML detector
produces for the same form, and the PDF converted to a single record table.

**Not the same guarantee as HTML.** A markup hint is something the extractor
*proved*; a page hint is a vision model's reading of a picture. It is validated
before use and it is introduced to the conversion as an observation to reconcile
against the pages, not as law. If a form exists as both PDF and HTML mock-up,
the HTML is still the more reliable upload.

**Why every hint is discardable.** A malformed or hallucinated hint is worse
than none — it steers the conversion wrong with confidence. So a reported table
is dropped whole if any label is unusable, if the model flagged low confidence,
if a matrix has fewer than 3 rows or a log fewer than 2 columns, or if the reply
does not parse. Partial row lists are never salvaged.

**Classical line detection** on the `pdftoppm` images was the other candidate in
the issue. It is not implemented: the vision pre-pass covers ruled and unruled
tables alike, and adds no image-processing dependency.

## 3. Hidden conditional fields are stripped — resolved

**Was:** the extractor removes `display:none` content deliberately, because
hidden markup is the classic place to smuggle instructions to the model. The
collateral damage was *legitimately* hidden fields — the "Please specify…" input
that appears only when a select is set to "Other". The VIP form lost 2 of its 23
fields that way.

**Now** ([#74](https://github.com/daivahealth/openmedform/issues/74)): the
extractor recognises that one narrow pattern *before* the strip, keeps the
field, and tells the model to emit it with a SHOW rule bound to its select. The
VIP form converts to all 23 fields. See
[Conditional fields](PDF-TO-FORM.md#conditional-other--please-specify-fields).

General hidden-content stripping is unchanged. What is spared is deliberately
tiny:

- only an `<input>` or an **empty** `<textarea>` — never a container, so no
  hidden prose rides along. (`<textarea>` is not void, so a populated one is
  treated as prose and stays stripped.)
- only beside a `<select>` that actually offers an "Other"-style option, and
  only within that select's own parent.
- only text-entry inputs — a hidden checkbox, radio or `type="hidden"` is not a
  "specify" companion.
- the one string a hidden element can newly put in front of the model is its own
  label, capped at 60 characters.

Anything else with `display:none` is removed and reported exactly as before.

## 4. Scripted behaviour — declarative config now converts, on request

Conversion captures fields. What the mock-up's JavaScript *does* with them
splits into two halves, and only one of them is recoverable without running the
page.

**Declarative config — now converts** ([#75](https://github.com/daivahealth/openmedform/issues/75)),
when the uploader ticks **"Read option lists from this mock-up's scripts"**:

- option lists that never appear in the markup (the insulin-type dropdown)
- option cascades (interventions scoped to the GRBS glycaemia category)
- thresholds (the <40 / 40–53 / 54–70 / 71–180 / >180 reference bands)
- score → stage → description reference tables (VIP's `vipRefFull`)

The scripts are **parsed, never executed**, and only whole literal values are
taken — see [Reading config from
scripts](PDF-TO-FORM.md#reading-config-from-scripts-opt-in) for the parser's
rules, its caps, and why this is not a reversal of the strip-scripts default.
Default is off; everything read is named in a conversion warning, and the opt-in
itself is audit-logged.

**Imperative behaviour — still not converted:**

- computed fields ("Intervention (auto)", day numbers derived from an insertion
  date) — these are functions, and a function body is never a literal
- cross-field enable/disable driven by code paths rather than a config table

Add those in the designer after conversion. Conditional *visibility* is a
separate case and already converts — see limitation 3.

## 5. Click-built content and unmeasured group boundaries — resolved

**Was:** the sandboxed render waited for load plus a short settle and read the
DOM once. Fields that only existed after an interaction were absent. And in a
transposed matrix, *which* rows repeat per sub-record (VIP: per Day vs per
Cannula) was inferred by the model from what the labels mean — the mock-up knew
the answer, because pressing "+ Day" adds cells to exactly the day-level rows,
but the render never pressed it.

**Now** ([#76](https://github.com/daivahealth/openmedform/issues/76)): a bounded
probe inside the same sandbox presses each add-control once and re-measures.
Two things follow:

- **Content that only exists after a click converts.** The post-probe DOM is
  read when it is richer than the pre-click one. A wound-assessment mock-up that
  renders nothing until "+ Add wound site" is pressed goes from 0 fields
  (rejected as "not a form") to a converted form.
- **The nested-group split is measured, not guessed.** Pressing "+ Day" on the
  VIP chart grows exactly 14 of its 22 rows, so those 14 are the day-level
  group and the other 8 belong to the cannula. The hint now says so, and the
  prompt tells the model not to move a row between levels.

See [Pressing the page](PDF-TO-FORM.md#pressing-the-page-interaction-probing)
for the bounds and the failure behaviour. In short: only add-affordance controls
are pressed, once each, at most three; the probe has its own budget inside the
render timeout; dialogs are dismissed; and a probe that times out or crashes
yields the un-probed result rather than a failure. `HTML_PROBE_DISABLED=1`
switches it off without giving up rendering.

**Residual limits:** only add-affordances are pressed, so content behind a tab,
an accordion or a "Show details" toggle is still missed. And a control is
pressed once — a structure that only appears on the *second* press is not seen.

## 6–7. Deliberate limits

- **Size caps** (120 fields, 120 table rows, 24k chars, 2 MB) exist because one
  conversion pass must emit the whole Data/UI/Print schema set; past the cap the
  model runs out of output budget and truncates *silently*, which is worse than
  a clear rejection. The caps and the output budget move together — see
  [PDF-TO-FORM](PDF-TO-FORM.md#size-and-complexity-limits). Split big forms
  into one file per section. All but the file-size cap are **deployment-level
  env vars** (`CONVERSION_MAX_FIELDS`, `CONVERSION_MAX_TABLE_ROWS`,
  `CONVERSION_MAX_TOKENS`, `CONVERSION_MAX_SOURCE_CHARS` — defaults 120 / 120 /
  32 768 / 24 000): an operator whose providers can emit more (OpenAI
  GPT-5-family, Claude) may raise them **together**. They are deliberately not
  per-user settings — the bound is what one model pass can reliably produce,
  not a fairness quota — and raising them past a smaller provider's output
  ceiling (Kimi, Minimax, Ollama) makes conversions on that provider fail or
  truncate.
- **Structural, not pixel, fidelity** on screen is a stance, not a gap: the
  renderer is a responsive data-entry engine. Paper-accurate output is the
  print engine's job, reconstructing A4 from the Print Schema.

## What already degrades gracefully

Worth knowing when assessing a bad conversion — these safety nets are in place:

- **Unconfigured arrays never render as the stock widget.** If the model emits
  an array of objects without `recordTable` config, columns are derived from the
  item schema and it renders as a usable table (`deriveRecordColumns` in
  form-core). Degraded, not broken.
- **Errors name their cause.** A rejected upload distinguishes "no browser in
  this deployment" / "rendering disabled" / "the page built nothing" — each
  points at whoever can actually fix it.
- **Nothing is dropped silently.** Uncertain or unrecoverable elements become
  conversion warnings on the job, surfaced in review.
- **Review is the backstop.** Every conversion lands as a REVIEW-status draft;
  "Refine with AI" fixes what the pipeline got wrong before anything is
  published.

## Triaging a bad conversion

Ask one question first: **did the detector miss the shape, or did the model
ignore a hint it was given?** The conversion warnings answer it — a detected
structure is named in the hints; its absence means detection missed. The two
have different fixes (extractor work vs prompt work), and issues filed against
the wrong one don't get better.
