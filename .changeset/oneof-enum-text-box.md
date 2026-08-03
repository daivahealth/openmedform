---
"@openmedform/react-form-renderer": patch
"@openmedform/angular-form-renderer": patch
---

Fix a `oneOf` enum rendering as an empty text box

`{ type: "string", oneOf: [...] }` is both a string control and a single-select.
The React string-input tester excluded `isEnumControl` but not
`isOneOfEnumControl`, so it matched at the same rank as the select — and being
registered first, it won. Every scored dropdown in a converted form rendered as
an empty text box with its options nowhere on screen, which also left the score
stuck at zero because nothing could be selected.

The input tester now excludes both. Angular was already correct because its enum
tester outranks the text control; that ordering is now asserted by a test rather
than holding by accident, which meant moving `enumControlTester` and
`textControlTester` into the pure `testers` module so they can be imported
without pulling in Angular.
