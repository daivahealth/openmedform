---
'@openmedform/angular-form-renderer': patch
---

Fix 3–5 s lag when opening a dropdown (or clicking anywhere) on large forms. Every `<omf-field-history>` chip registered its own `document:mousedown` listener, and under zone.js each one triggered a full change-detection pass — ~190 passes per click on the ICU progress note. The outside-click / Escape listeners are now attached only while a chip's popover is open, outside Angular's zone.
