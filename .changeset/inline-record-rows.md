---
'@openmedform/angular-form-renderer': minor
'@openmedform/react-form-renderer': minor
'@openmedform/form-core': minor
---

Make `recordTable` rows editable in place.

A summary column naming one concrete field now renders that field's real control
in the cell — date picker, select, number — so a row is filled in exactly as on
the grid it was converted from. Previously every cell was read-only text and the
only way to edit was the detail panel, which made a wide observation chart
effectively unusable.

- Derived columns stay read-only: `countOf` and `pairWith` have no single value
  to write back.
- The actions column is **pinned to the right edge**. On a ten-column chart it
  used to scroll out of view, leaving a row with no way to be deleted.
- `Open` is hidden when every field is already a column, since the panel it
  opens would be empty. Records with more fields keep it.
- `isColumnEditable()` and `fieldsOutsideColumns()` added to form-core, shared
  by both renderers so a row behaves identically in the web app and an EMR.
