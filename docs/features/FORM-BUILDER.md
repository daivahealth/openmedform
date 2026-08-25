# Form Builder

## Overview

There is **no drag-and-drop builder**. It was Form.io-only and was removed with
that engine — see [ADR-004](../ADR/004-remove-formio-engine.md). Form authoring
is AI-first:

1. **Convert a source document** — upload a PDF, image or HTML mock-up from the
   forms list ("From File"). See [PDF-TO-FORM.md](PDF-TO-FORM.md).
2. **Or describe the form** — "From Prompt" creates a draft from a
   natural-language description.
3. **Refine by prompt** — on the form's preview page, "Refine with AI" edits the
   draft in place (optionally with a reference image attached). Published
   versions are immutable, so a refine after publish forks a new draft.
4. **Publish** — makes the version available for data entry.

A form's structure is a JSON Forms UI schema, so nothing stops a developer from
editing the schema directly through the API; there is simply no visual editor
surface in the product.

## Clinical controls

Rendered by both the React and Angular renderers from `options.omf.control`.
The canonical vocabulary is `OMF_CONTROL_NAMES` in form-core's control
registry; parity tests in both renderer packages (and a pinned list in the AI
prompt tests) fail CI if a control is added without being implemented in both
frameworks:

| Control | Purpose |
|---------|---------|
| `scoringMatrix` | Grid with domain-grouped rows, checkboxes, point values, auto-sum |
| `checklistMatrix` | Repeating label rows against per-column tick boxes (needs `omf.rows`/`omf.columns`) |
| `checkboxGroup` | Multi-select ("choose all that apply") — an array of coded options rendered as one checkbox row; also the automatic fallback for any enum/`oneOf` array, even one mislabelled `checklistMatrix` |
| `recordTable` | Repeating encounter log — add/remove records with an expandable tabbed detail panel |
| `colorCodedGrid` | Table with coloured rows, highlights the active row based on score |
| `clinicalReferenceTable` | Read-only reference table (dosing guides, contraindications) |
| `riskStratification` | Computed badge showing risk level, updates reactively |
| `scoreSummary` | Live total with risk bands |
| `vitalSignsChart` | Multi-parameter observation chart |
| `signatureDate` | Signature + printed name + auto-date |

Scored sections also carry `omf.accentColor`, `omf.icon`, `omf.points` and
`omf.pointLegend` to reproduce colour-coded paper domains. A section with
scored fields shows a live "Σ n" subtotal chip in its header automatically —
the INNERMOST one: a Group that merely contains scoring sections stays quiet,
because a box grouping qSOFA and SIRS totals nothing on the paper. Two flags
override that per section: `omf.showSectionTotal: true` puts the chip on an
outer Group whose combined total the source does print, and
`omf.hideSectionTotal: true` removes it from a section that would draw one
(the refine chat can set either — "remove the Σ 0 from that box"). Neither
touches the scoring itself: every item still feeds the grand total and the
per-section breakdown. Scoring shown on screen is advisory: the server recalculates on
submission and is authoritative.

### Two shapes of scoring

Which one a form uses is decided by the paper, not by preference:

| Paper shows | Emit | Scores when |
|---|---|---|
| a tick-box row with a points column (`Acute MI …… 1`) | boolean Control + `omf.points: 1` | the box is ticked |
| one dropdown or one set of mutually-exclusive radios whose **choice** carries the score | enum Control + `omf.optionPoints: { NO: 0, YES: 25 }` | that option is selected |

`omf.optionPoints` is keyed by the stored code, so codes stay clean and
language-independent — Morse Fall's ambulatory aid is
`{ NONE_BEDREST_NURSE_ASSIST: 0, CRUTCHES_CANE_WALKER: 15, FURNITURE: 30 }`,
never a code like `CRUTCHES_CANE_WALKER_15`. A code the map does not price
contributes nothing rather than a guess, so a response saved against an older
version of the form fails safe.

### Enum option labels

A stored code is language-independent and usually unreadable. Display text comes
from the dataSchema's `oneOf`:

```json
{ "oneOf": [{ "const": "NO", "title": "No" }, { "const": "YES", "title": "Yes" }] }
```

or, for a schema that already carries a plain `enum`, from
`omf.optionLabels: { "NO": "No" }`. Both renderers resolve options through
`resolveEnumOptions` in `@openmedform/form-core`, so React and Angular cannot
label the same schema differently. With neither, the renderer shows the bare
code — visibly wrong on purpose, since an empty control would hide the mistake.

Note that the `translations` bundle is **not** wired into either renderer today,
so it cannot supply option labels.

### Conditional rows in a table

Any UI element may carry a JSON Forms `rule` (`SHOW` / `HIDE` / `ENABLE` /
`DISABLE`); `form-core`'s `evaluateRule()` is the single implementation, so a
condition means the same thing in React, in Angular and on the server.

An `OmfTableRow` is the one place this needs saying. A row is *not* dispatched
through the framework — the table renderer maps it straight onto a `<tr>`,
because the row is the layout — so a rule on a row was ignored by both renderers
until it was handled explicitly. Both now resolve their rows through
`filterVisibleElements()` in `form-core`, which is what makes a stepwise
assessment work: CAM-ICU asks Feature 2 only once Feature 1 is present.

```jsonc
{
  "type": "OmfTableRow",
  "label": "Feature 2: Inattention",
  "elements": [{ "type": "Control", "scope": "#/properties/feature2" }],
  "rule": {
    "effect": "SHOW",
    "condition": { "scope": "#/properties/feature1", "schema": { "const": "PRESENT" } }
  }
}
```

Put the rule on the **row**, not on the Controls inside it — a gated row appears
and disappears as a unit, where gated Controls leave an empty row behind. A
`DISABLE` on a row is ANDed into every cell it contains. A conditionally-shown
field is never listed in `required`: it is absent whenever the condition is
false. Conversion emits these rules automatically for a mock-up that reveals
sections with JavaScript — see
[Progressive disclosure](PDF-TO-FORM.md#progressive-disclosure-script-revealed-sections).

**On paper**, the print engine evaluates the same rules with the same form-core
code, and which way it resolves follows what the sheet is for: a **blank** form
prints every conditional section (it is there to be filled in by hand), while a
**filled** one omits a section the response never triggered (a question that was
never asked does not belong in the record). `renderPrintHtml`'s `rules: 'apply' |
'ignore'` overrides either default. Only visibility applies — `ENABLE`/`DISABLE`
have no meaning on paper, so a disabled field still prints.

## Removing Forms

The forms list (`/forms`) offers two removal actions:

- **Archive** (soft delete) — sets the form status to `ARCHIVED`. The form and all its data are retained; it is only hidden from active workflows. This is the default, recoverable option.
- **Delete permanently** (hard delete) — irreversibly removes the form and **all** related data in a single transaction: every form version (including draft schemas), every submission (clinical records), and all AI chat history. A confirmation dialog fetches and displays the exact counts (via `GET /api/forms/:id/deletion-summary`) before the user confirms.

Both actions are tenant-scoped. Prefer **Archive** for anything that has clinical submissions; permanent delete destroys those records with no recovery.
