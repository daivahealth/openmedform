---
publish: true
description: "Architecture decision: separating data, UI and print schemas on the JSON Forms platform."
---

# ADR-003: JSON Forms platform — Data / UI / Print separation

## Status

Accepted. This describes the architecture **as it is today**.

## Context

Clinical forms are dense: two-column SBAR narratives, scored risk domains,
periodic reassessment grids, repeating treatment-day logs. They have to render
in a React web app, inside an Angular EMR, and on A4 paper — from one definition,
with no per-form code in any renderer.

## Decision

A form is three schemas, not one:

| Artifact | What it holds | Standard |
|---|---|---|
| **Data Schema** | fields, types, enums, required, ranges | JSON Schema 2020-12 |
| **UI Schema** | layout, grouping, control selection | JSON Forms + `options.omf` |
| **Print Schema** | A4 page size, margins in mm, page breaks | OpenMedForm |

Plus translations, asset references, and conversion metadata (per-field
confidence and warnings).

Separating them is what makes one definition serve three targets: the same Data
Schema validates on the client and the server, while the UI and Print schemas
describe the same form for a screen and for paper independently.

The engine is **JSON Forms** (EclipseSource): it is natively data/UI-separated,
ships React *and* Angular renderers from one schema, and validates with Ajv
2020-12.

### Platform extensions: the `omf` namespace

JSON Forms' vocabulary does not cover clinical layout or print. Extensions ride
under a single vendor key, `options.omf`, so upstream JSON Forms upgrades stay
clean and stock renderers pass them through untouched:

- `control` — selects a custom control (`scoringMatrix`, `checklistMatrix`,
  `recordTable`, `colorCodedGrid`, `clinicalReferenceTable`,
  `riskStratification`, `scoreSummary`, `vitalSignsChart`, `signatureDate`)
- `accentColor`, `icon`, `points`, `pointLegend` — reproduce colour-coded scored
  domains from paper
- `variant`, `columns`, `screen.labelPosition` — layout fidelity
- `print` — mm dimensions for the print engine
- `recordTable`, `bands` — configuration for repeating logs and risk bands

Custom layout element types use an `Omf*` prefix (`OmfTableLayout`,
`OmfTableRow`, `OmfTabsLayout`, …).

### Layering

Framework independence is enforced by what each package is allowed to import:

- **`form-schema-types`** — contract types only. No runtime.
- **`form-core`** — the engine: Ajv 2020-12 validation, scope/`$ref` resolution,
  data binding, conditional rules (SHOW/HIDE/ENABLE/DISABLE), i18n, the control
  registry contract, response serialization, scoring, and record-table summary
  derivation. **No React, no Angular, no DOM.**
- **`form-design-tokens`** — `--omf-*` CSS variables and TS constants
  (typography, spacing, borders, row heights). This is what makes the two
  renderers look *equivalent*, not merely structurally similar.
- **`react-form-renderer`** — `<FormRenderer definition={…} />` over
  `@jsonforms/react`.
- **`angular-form-renderer`** — `<omf-form [definition]="…">` over
  `@jsonforms/angular`, with a hand-written token-styled renderer set (no
  Angular Material).
- **`form-print-engine`** — UI + Print schema → self-contained A4 HTML/CSS
  (`@page` in mm) → PDF. Never PDF-as-background.

Renderers only *interpret* schemas. No form-specific field, label or rule lives
in renderer code.

**Both renderers must implement every clinical control**, with shared logic in
`form-core`. A control that exists in only one framework, or derives a value
differently in each, would mean the same form reads differently in the EMR than
in the web app — a clinical safety problem, not a cosmetic one.

### Scoring is computed twice, defined once

The renderers show a live total as the user ticks boxes; the server recalculates
on submission and that result is what gets stored. Both call the same
implementation in `form-core`, so the two cannot drift. No `eval()` anywhere —
scoring is a declarative rule set, not executable code.

## Headless Chromium

The API image ships Chromium. It is used for **one** thing today: rendering
uploaded HTML mock-ups whose form is built at runtime by JavaScript.

An AI-generated mock-up routinely builds its whole form from a config array, so
the markup contains a heading, an empty container and nothing else. Conversion
reads markup only, so there would be nothing to convert. When a mock-up ships
scripts *and* has no fields, or has named-but-empty containers, the page is
executed and the resulting DOM is read instead —
[`html-render.ts`](../../apps/api/src/common/utils/html-render.ts).

**Rendering is not trusting.** The uploaded file remains untrusted:

- **Isolation is Chromium's own OS-level sandbox.** Uploaded script is never
  evaluated in the API process. (jsdom was rejected for this reason — it would
  run untrusted code inside Node.) `--no-sandbox` is deliberately never passed;
  the sandbox *is* the security boundary.
- **No network.** The browser context is `offline`, every request is aborted by
  a catch-all route, and content is injected with `setContent` rather than
  navigated to — so the page has no origin to fetch from. Verified against a
  page attempting cloud-metadata, `file:///etc/passwd` and external exfil: all
  blocked.
- **Bounded.** 10s wall-clock cap, downloads refused, pop-ups closed unread,
  context always torn down. A runaway script costs one timeout.
- **Output is re-sanitised.** The rendered DOM goes back through the same
  extractor as any static upload: scripts stripped, attribute allow-list
  enforced, hidden content removed. Rendering widens what can be **read**, never
  what reaches the model.

**Optional.** With no browser installed, or `HTML_RENDER_DISABLED=1`, rendering
returns nothing and conversion falls back to the static markup. Local
development and CI need no Chromium. On Alpine the distro `chromium` package is
used (Playwright's bundled build does not support Alpine) via `CHROMIUM_PATH`.

Cloud Run instances need **≥1 GiB** — Chromium is short-lived but not free.

> **Not yet used for print.** The print/visual-diff loop still expects a
> deployment-injected rasterizer. A browser is now present that could serve it;
> wiring it up is an open task.

## Consequences

- One definition renders in React, Angular and on A4.
- Data is validated by the same Ajv dialect on both sides of the wire.
- Every clinical control costs two implementations (React + Angular). The shared
  `form-core` and design tokens keep that cost to presentation, not logic.
- **Print fidelity is "as accurate as possible", not pixel-perfect.**
  PDF-as-background is forbidden; the print engine reconstructs from schema.
- Adding Chromium enlarges the API image and its memory floor. Rendering is
  opt-out precisely so a deployment can decline that trade.

## References

- Contracts — [`packages/form-schema-types`](../../packages/form-schema-types/src/ui-schema.ts)
- Conversion behaviour — [PDF-TO-FORM](../features/PDF-TO-FORM.md)
- Controls — [FORM-BUILDER](../features/FORM-BUILDER.md)
- Embedding — [THIRD-PARTY-GUIDE](../integration/THIRD-PARTY-GUIDE.md)
