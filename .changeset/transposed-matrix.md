---
'@openmedform/angular-form-renderer': minor
'@openmedform/react-form-renderer': minor
'@openmedform/form-schema-types': minor
'@openmedform/form-core': minor
---

Support matrix-shaped record tables and never fall back to the stock array widget.

- `omf.recordTable.orientation: "columns"` renders records as columns with field
  labels down the left, mirroring paper charts that compare instances side by
  side (a cannula chart, an observation matrix). `instanceLabel` supplies the
  column noun — `"Cannula"` heads them "Cannula 1", "Cannula 2". Both
  orientations store identical data; the default stays `rows`.
- Any array-of-objects control **without** `omf.recordTable` config now renders
  as a record table with columns derived from the item schema, instead of
  falling through to `@jsonforms/vanilla-renderers`' generic list. The
  "Add to … / Items / Valid / No data" widget is unreachable in both renderers.
- `deriveRecordColumns()` added to form-core, shared by both renderers so a
  derived table is identical in the web app and in an EMR.
- `omf.columns` entries accept an optional `key`, which `checklistMatrix` needs
  and the type had never modelled.
