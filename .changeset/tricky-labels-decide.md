---
"@openmedform/form-schema-types": patch
"@openmedform/form-core": patch
"@openmedform/form-design-tokens": patch
"@openmedform/react-form-renderer": patch
"@openmedform/angular-form-renderer": patch
---

Documented and pinned root-scope conditions. A rule condition whose `scope` is
`#` resolves to the whole response rather than one field, so its `schema` can
combine several answers with ordinary JSON Schema — `properties` + `required`
for AND, `anyOf` for OR. That is what a derived clinical outcome needs
("POSITIVE only if Feature 1 AND Feature 2 AND (Feature 3 OR Feature 4)"),
expressed as one `Label` per outcome and evaluated by the same deterministic
`form-core` code as every other rule — no expression language, no `eval`.

This already worked; nothing in the engine changed. It is now covered by tests
in form-core and the React renderer so it cannot regress, and documented in
FORM-BUILDER.md, because conversion now emits it for mock-ups that compute a
result banner in JavaScript.
