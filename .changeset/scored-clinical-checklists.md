---
"@openmedform/form-schema-types": minor
---

Add colour-coded, icon-headed scored clinical checklists to the jsonforms engine.

- New `options.omf` extensions: `accentColor`, `icon`, `points`, `pointLegend`,
  and scoreSummary `bands` for risk stratification.
- `@openmedform/form-core` gains a framework-independent scoring module
  (`collectScoreItems` / `computeScore` / `stratify` / `scoreUiSchema`) — the
  single source of truth for the live on-screen total and the server's
  authoritative recomputation.
- The React and Angular renderers draw colour-coded point badges, per-section
  subtotals, and a live `scoreSummary` (grand total + risk band).
- Radio controls support `options.omf.screen.labelPosition: "left"` for
  label-left / options-right YES/NO rows (the default for a two-option radio).
- Section headers de-duplicate the icon glyph when the label already embeds it.
- New `options.omf.variant: "subsection"` on Group — an indented sub-heading with
  nested items (no box) that preserves heading-plus-indented-list hierarchy.
