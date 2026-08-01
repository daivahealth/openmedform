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

Rendered by both the React and Angular renderers from `options.omf.control`:

| Control | Purpose |
|---------|---------|
| `scoringMatrix` | Grid with domain-grouped rows, checkboxes, point values, auto-sum |
| `checklistMatrix` | Repeating label rows against per-column tick boxes |
| `recordTable` | Repeating encounter log — add/remove records with an expandable tabbed detail panel |
| `colorCodedGrid` | Table with coloured rows, highlights the active row based on score |
| `clinicalReferenceTable` | Read-only reference table (dosing guides, contraindications) |
| `riskStratification` | Computed badge showing risk level, updates reactively |
| `scoreSummary` | Live total with risk bands |
| `vitalSignsChart` | Multi-parameter observation chart |
| `signatureDate` | Signature + printed name + auto-date |

Scored sections also carry `omf.accentColor`, `omf.icon`, `omf.points` and
`omf.pointLegend` to reproduce colour-coded paper domains. Scoring shown on
screen is advisory: the server recalculates on submission and is authoritative.

## Removing Forms

The forms list (`/forms`) offers two removal actions:

- **Archive** (soft delete) — sets the form status to `ARCHIVED`. The form and all its data are retained; it is only hidden from active workflows. This is the default, recoverable option.
- **Delete permanently** (hard delete) — irreversibly removes the form and **all** related data in a single transaction: every form version (including draft schemas), every submission (clinical records), and all AI chat history. A confirmation dialog fetches and displays the exact counts (via `GET /api/forms/:id/deletion-summary`) before the user confirms.

Both actions are tenant-scoped. Prefer **Archive** for anything that has clinical submissions; permanent delete destroys those records with no recovery.
