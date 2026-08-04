---
"@openmedform/form-schema-types": minor
"@openmedform/react-form-renderer": minor
"@openmedform/angular-form-renderer": minor
---

Add `options.omf.hideSectionTotal` — suppress a section's automatic Σ chip

A section containing scored fields gets a live "Σ n" subtotal chip in its
header automatically. That chip was renderer-drawn with no schema opt-out, so
an author (or the refine AI) asked to "remove the Σ 0 from that box" had no
way to express it — the request failed silently. The flag hides the badge on
that one section, in both renderers; the fields stay scored and keep feeding
the grand total.
