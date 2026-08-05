---
"@openmedform/react-form-renderer": patch
---

Pin the add-a-record journey against a real converted cannula chart

A production "Add Cannula" click was reported as taking the whole page down.
The renderer package now carries the VIP cannula chart exactly as the
conversion pipeline emitted it (real model output as a fixture, quirks
included) and a test that renders it and adds a record — so the journey is
regression-pinned against the true artifact shape, not a hand-tidied one.
