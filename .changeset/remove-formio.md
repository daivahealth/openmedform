---
'@openmedform/angular-form-renderer': major
'@openmedform/react-form-renderer': major
'@openmedform/form-schema-types': major
'@openmedform/form-core': major
'@openmedform/form-print-engine': major
'@openmedform/form-design-tokens': major
---

Remove the Form.io engine. JSON Forms is now the only engine (ADR-004).

**Breaking:**

- `FormDefinition` is no longer a discriminated union. The `engine` field, the
  `FormEngine` type, and the `isFormioDefinition` / `isJsonFormsDefinition`
  narrowing helpers are gone. `JsonFormsFormDefinition` is kept as an alias of
  `FormDefinition`, so imports of that name keep resolving — drop `engine:
  'jsonforms'` from any definition you construct.
- `FormRenderer` no longer accepts `patientContext` or `onSubmit`. Those
  belonged to the Form.io branch, which owned the patient banner and the submit
  lifecycle; render your own submit control and call your own handler.
- `FormioBranch` and its props type are no longer exported.
- `FormInstance` no longer carries `engine`.

**Not breaking:**

- `@openmedform/react-form-renderer/jsonforms` still resolves — it is now an
  alias of the package root, which is Form.io-free by construction.
- The `omf` UI vocabulary, all clinical controls, the design tokens and the
  print engine are unchanged.

Migration for an EMR integration is usually a two-line diff: delete
`engine: 'jsonforms'` from the definition you build, and move your submit button
out of the renderer.
