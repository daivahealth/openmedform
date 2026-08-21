---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

New `checkboxGroup` multi-select control in both renderers (one checkbox per
coded option for `array` + `items.oneOf`/`enum` fields), with shared option
resolution via `resolveMultiEnumOptions` in form-core. Its tester also rescues
enum arrays mislabelled `checklistMatrix`, which previously rendered an empty
grid. Fixes the Angular radio control's label-left layout showing
`[object Object]` instead of option labels and never marking the selection.
Angular string controls now honour `format: "time"` / `"date-time"` /
`"email"` with native inputs, matching React. form-core exports
`OMF_CONTROL_NAMES`, the canonical `omf.control` vocabulary both renderers
parity-test against.
