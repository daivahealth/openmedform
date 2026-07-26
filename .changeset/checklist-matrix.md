---
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

Add a `checklistMatrix` control for periodic-reassessment grids.

New `options.omf.control: "checklistMatrix"` renders a rows × columns checkbox
grid (e.g. Nursing Diagnosis × Day 1–5), configured via `options.omf.rows` /
`options.omf.columns` and bound to an object value `{ [rowKey]: { [colKey]: true } }`.
Rendered identically in the React and Angular renderers. The jsonforms conversion
prompt now uses it for daily/periodic reassessment tables and extracts dense
multi-page sections (side-by-side contraindication/orders boxes, long medication
lists) exhaustively instead of leaving later sections empty.
