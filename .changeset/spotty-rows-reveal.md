---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

`OmfTableRow` now honours its own JSON Forms `rule` in both renderers, so a
table can reveal rows in turn — a stepwise assessment such as CAM-ICU asks
Feature 2 only once Feature 1 is present. A row is the layout itself and never
passes through a dispatch, so the rule was previously ignored by React and
Angular alike; both now resolve their rows through form-core's new
`filterVisibleElements()`, the same evaluation the server uses. A `DISABLE` on a
row is ANDed into every cell it contains. form-core also exports
`hasElementRules()` for renderers that subscribe to state only when a container
actually has conditional children.
