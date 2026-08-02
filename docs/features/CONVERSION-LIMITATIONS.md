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
| 2 | PDFs and images get no deterministic hints at all | High | Prefer an HTML mock-up of the same form when one exists | [#73](https://github.com/daivahealth/openmedform/issues/73) |
| 3 | Hidden conditional fields ("Other → Please specify…") are stripped and lost | Medium | Reveal them (`display:block`) before uploading; re-add in the designer otherwise | [#74](https://github.com/daivahealth/openmedform/issues/74) |
| 4 | Scripted behaviour is not converted — option cascades, thresholds, computed fields, enable/disable | Medium | Add the options/rules in the designer after conversion | [#75](https://github.com/daivahealth/openmedform/issues/75) |
| 5 | Content that only exists after a click is missed; matrix group-boundaries are inferred, not measured | Medium | Click the relevant buttons, then export `outerHTML` and upload that | [#76](https://github.com/daivahealth/openmedform/issues/76) |
| 6 | Size caps: 120 fields / 120 table rows / 24k chars / 2 MB per HTML upload | By design | Split into one file per section | — |
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

## 2. PDFs and images get no deterministic hints

Every structural hint is extracted from HTML markup. A PDF or image goes to the
model as page pictures plus text — no repeating-log hint, no matrix hint, no
placeholder warnings. A scanned cannula-style matrix in a PDF therefore relies
entirely on prompt rules, and converts strictly less reliably than the same form
as HTML.

**Overcoming it** ([#73](https://github.com/daivahealth/openmedform/issues/73)):
a narrow vision pre-pass ("describe the table structures on this page" →
schema-validated JSON → the same hint text), possibly combined with classical
line-detection on the `pdftoppm` images for ruled tables. The hint mechanism
downstream already exists; only the source changes.

**Until then:** if a form exists as both PDF and HTML mock-up, upload the HTML.

## 3. Hidden conditional fields are stripped

The extractor removes `display:none` content deliberately — hidden markup is the
classic place to smuggle instructions to the model. The collateral damage is
*legitimately* hidden fields: the "Please specify…" input that appears only when
a select is set to "Other". The VIP form loses 2 of its 23 fields this way.

The frustrating part: the platform already supports conditional visibility —
`form-core` evaluates JSON Forms SHOW/HIDE/ENABLE/DISABLE rules. Conversion just
never emits them.

**Overcoming it** ([#74](https://github.com/daivahealth/openmedform/issues/74)):
detect the narrow, safe pattern (hidden input adjacent to a select carrying an
"Other" option) *before* the strip, reveal it, and have the prompt emit the
field with a SHOW rule bound to that select. General hidden-content stripping —
the security behaviour — stays exactly as is.

## 4. Scripted behaviour is not converted

Conversion captures fields; it does not capture what the mock-up's JavaScript
*does* with them:

- option cascades (interventions scoped to the GRBS glycaemia category)
- thresholds (the <40 / 40–53 / 54–70 / 71–180 / >180 reference bands)
- computed fields ("Intervention (auto)", day numbers from an insertion date)
- cross-field enable/disable (drug type locked during hypoglycaemia)

Scripts are stripped before the model sees anything — the correct default for
untrusted uploads, and one this document does not propose weakening by default.

**Overcoming it** ([#75](https://github.com/daivahealth/openmedform/issues/75)):
an **explicit opt-in** that AST-parses the script for literal config arrays —
parse only, never execute — and passes them as data under the same
untrusted-source framing, mapped to things the platform already has: enum
options, reference tables, scoring bands, ENABLE/DISABLE rules. Off by default;
every extracted piece flagged in the conversion warnings.

## 5. Click-built content and unmeasured group boundaries

The sandboxed render waits for page load plus a short settle, then reads the DOM
once. Two consequences:

- Fields that only exist after an interaction (a panel that appears on click)
  are absent from the conversion.
- In a transposed matrix, *which* rows repeat per sub-record (VIP: per Day vs
  per Cannula) is inferred by the model from the labels' meaning. The mock-up
  itself knows the answer — clicking "+ Day" adds cells to exactly the day-level
  rows — but the render never clicks it.

**Overcoming it** ([#76](https://github.com/daivahealth/openmedform/issues/76)):
a bounded probe inside the existing sandbox — click each detected add-affordance
once (hard cap, same isolation, same timeout), diff the DOM, and feed the
*measured* structure into the hint. Probe failure degrades to today's
behaviour, never to a worse one.

## 6–7. Deliberate limits

- **Size caps** (120 fields, 120 table rows, 24k chars, 2 MB) exist because one
  conversion pass must emit the whole Data/UI/Print schema set; past the cap the
  model runs out of output budget and truncates *silently*, which is worse than
  a clear rejection. The caps and the output budget move together — see
  [PDF-TO-FORM](PDF-TO-FORM.md#size-and-complexity-limits). Split big forms
  into one file per section.
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
