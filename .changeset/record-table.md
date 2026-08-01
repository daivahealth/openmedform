---
'@openmedform/angular-form-renderer': minor
'@openmedform/react-form-renderer': minor
'@openmedform/form-schema-types': minor
'@openmedform/form-core': minor
---

Add `recordTable` — the repeating clinical encounter log — plus `OmfTabsLayout`.

A source form that carries a table the user adds rows to (a treatment day, a
medication round, an observation entry) now renders as that table in both
renderers: a toolbar with a live count and an add button, one summary row per
record, and an expandable inline detail panel with a Close button. Previously an
array of objects fell through to the stock JSON Forms list widget
("Add to … / Items / Valid / No data"), which looks nothing like the source.

- `options.omf.control: "recordTable"` with `omf.recordTable`
  (`addLabel`, `countLabel`, `emptyLabel`, `removeConfirm`, `columns`). Columns
  read a dot path inside one record, with `pairWith` for a combined `A / B`
  header and `countOf` for a header that counts nested records.
- `options.detail` holds the per-record UI schema — typically an `OmfTabsLayout`,
  a new layout that turns its children into tab pages titled by their labels.
- Record tables nest: a treatment day's drug list is itself a `recordTable`, and
  the parent's "Drugs" column counts it.
- Summary-cell derivation, record seeding and the count line live once in
  `@openmedform/form-core` (`record-table/summary.ts`) and are shared by both
  renderers, so a log cannot read differently in an EMR than in the web preview.
