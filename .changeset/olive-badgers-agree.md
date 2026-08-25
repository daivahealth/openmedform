---
"@openmedform/form-schema-types": minor
"@openmedform/form-core": minor
"@openmedform/form-design-tokens": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
"@openmedform/form-print-engine": minor
---

**Licensing is now Apache-2.0 across every package, matching the repository's
`LICENSE` file.**

Five packages (`form-schema-types`, `form-core`, `form-design-tokens`,
`react-form-renderer`, `angular-form-renderer`) declared `MIT` in their
`package.json` while the only licence text in the repository — the one a
consumer actually finds — has always been Apache-2.0. That was wrong metadata
rather than a second grant, and it is corrected here; `form-print-engine` and
the applications already declared Apache-2.0.

Every published package now also ships the full `LICENSE` text in its tarball,
so the terms travel with the package instead of only living in the repository.

Versions already on npm are unaffected: whatever grant they were published
under stands for those versions.
