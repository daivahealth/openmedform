# ADR-003: Dual-Engine Form Platform with JSON Forms (Data/UI/Print separation)

## Status
Accepted

## Context
The original engine (ADR-001) is a forked Form.io whose schema couples data,
layout, and validation in one `components[]` tree. Complex clinical PDFs (e.g.
the RRT/SBAR two-column form) are hard to express faithfully, and Form.io has no
healthy Angular v5 renderer, blocking a multi-framework requirement.

We need: a schema that separates **data** from **layout** from **print**;
the same definition rendered in **both React and Angular**; server-side
validation; and an AI PDF→form pipeline that targets a clean, framework-neutral
contract. At the same time, existing Form.io forms and the Form.io authoring
path must be preserved, not thrown away.

## Decision
Adopt a **pluggable dual-engine** model. A `FormDefinition` carries an `engine`
discriminator:

- `engine: 'formio'` → the existing coupled Form.io `schema` (preserved as-is).
- `engine: 'jsonforms'` → separated `dataSchema` (JSON Schema 2020-12) +
  `uiSchema` (JSON Forms layout) + `printSchema`, plus translations, assets, and
  conversion metadata.

JSON Forms (EclipseSource) is the recommended path for new complex/multi-
framework forms: it *is* the Data/UI/Print separation, ships React **and**
Angular renderers from one schema, and validates with Ajv (Draft 2020-12).
Form.io stays for existing forms and authors who prefer it. Supported matrix:
`formio → React`; `jsonforms → React + Angular`. **Form.io × Angular is out of
scope** (no healthy renderer).

Framework-independence is enforced by layering:

- **`packages/form-schema-types`** — the contract types (FormDefinition,
  FormInstance, Data/UI/Print schemas, translations, assets, conversion
  metadata). UI-schema platform extensions ride under the vendor namespace
  `options.omf`; custom layout elements use the `Omf*` type prefix.
- **`packages/form-core`** — framework-independent engine: Ajv 2020-12
  validation, scope/`$ref` resolution, data binding, conditional-rule
  evaluation (SHOW/HIDE/ENABLE/DISABLE), i18n resolution, the control-registry
  contract, and response serialization. **No Angular/React imports.**
- **`packages/form-design-tokens`** — shared visual/layout tokens (typography,
  spacing, grid, borders, row heights, breakpoints) as TS constants and
  `--omf-*` CSS custom properties, consumed by both renderers so the same
  definition renders *equivalently* across frameworks, not merely structurally.

Renderers only *interpret* schemas; no form-specific fields/labels/rules live in
renderer code. Both framework renderers dispatch on `FormDefinition.engine`
behind a stable `FormRenderer` prop seam.

The React dispatcher lives in **`packages/react-form-renderer`**: `<FormRenderer
definition={...} />` routes a `formio` definition to the preserved
`@openmedform/renderer` (unchanged) and a `jsonforms` definition to
`@jsonforms/react` with the vanilla renderer set plus token-styled custom
controls — omf-aware textarea/radio and the six clinical controls (scoringMatrix,
vitalSignsChart, colorCodedGrid, riskStratification, signatureDate,
clinicalReferenceTable). Custom controls are selected by `options.omf.control`
via JSON Forms testers. Validation on the jsonforms path uses form-core's Ajv
2020-12 instance so the dialect matches the backend.

The Angular renderer lives in **`packages/angular-form-renderer`**: `<omf-form
[definition]="...">` wraps `@jsonforms/angular` with a **custom, token-styled
renderer set built from scratch** (no `@jsonforms/angular-material`) —
VerticalLayout/HorizontalLayout/Group/Label/Control (text/number/boolean/enum/
date) plus the same omf textarea/radio and six clinical controls, one-for-one
with React. Both frameworks share `form-core` (Ajv 2020-12 + testers logic) and
`form-design-tokens` (`--omf-*`), which is what makes the same jsonforms
definition render *equivalently* across frameworks. Angular is jsonforms-only —
there is no Form.io branch (Form.io has no healthy Angular v5 renderer).

## Consequences
- **Positive:** Clean separation of concerns; Ajv-validated data; one definition
  renders in React and Angular; existing Form.io forms keep working; the AI
  pipeline gets a framework-neutral target.
- **Negative:** Dual-engine surface — clinical controls, print paths, scoring
  extraction, and tests can exist for 2 engines × 2 frameworks. Added build and
  maintenance cost.
- **Mitigation:** The `engine` discriminator + shared `form-core` +
  `form-design-tokens` + one control-registry contract keep the surface
  contained; Form.io × Angular is explicitly excluded. JSON Forms UI-schema
  extensions are kept additive (under `options.omf`) so upstream upgrades stay
  clean.
- **Print fidelity** remains "as accurate as possible", proven by a later
  screenshot-diff loop — not pixel-perfect (PDF-as-background is forbidden).

## Implementation status
- **Phase 1 (done):** `form-schema-types` contracts; `form-core` Ajv validation;
  hand-authored RRT/SBAR reference `FormDefinition` (validates end-to-end).
- **Phase 2 (done):** `form-core` engine — scope/`$ref` resolution, binding,
  conditional-rule engine, i18n, control-registry contract, serialization (all
  framework-independent, unit-tested); `form-design-tokens` package.
- **Phase 3 (done):** `packages/react-form-renderer` dual-engine React
  dispatcher (formio branch delegates to the preserved `@openmedform/renderer`;
  jsonforms branch = `@jsonforms/react` + vanilla renderers + omf/clinical custom
  controls); jsdom render tests; `apps/react-demo` proves both engines render
  through one seam. A workspace `pnpm.overrides` pins a single `@types/react`
  (19.x) to resolve the dual-types conflict between apps/web (React 19) and the
  React-18-targeted renderer packages.
- **Phase 4 (done):** `packages/angular-form-renderer` (Angular 20 standalone,
  custom token-styled renderer set over `@jsonforms/angular`); `apps/angular-demo`
  (Analog + Vite). Cross-framework parity (spec §24) **browser-verified**: the
  same jsonforms RRT/SBAR reference renders in React AND Angular with equivalent
  field trees, and Angular two-way binding writes language-independent codes.
  Monorepo-tooling notes: form-core / form-design-tokens now emit **ESM** dist so
  rollup reads their named exports; the Angular demo consumes the renderer
  library as source, which requires adding that source to the app's ngtsc program
  (`tsconfig.app.json` `include`); the Analog **dev** server does not compile
  cross-package source, so the demo is verified via `vite build` + `vite preview`
  (a future `ng-packagr` build of the library would restore `vite dev`).
- **Phase 5 (done):** backend data model + API. `form_version` gained an
  `engine` discriminator + split `data_schema`/`ui_schema`/`print_schema`/
  `translations`/`conversion_metadata` + `content_hash`; new `form_asset`,
  `conversion_job`, `conversion_warning` tables; `FormStatus` gained CONVERTING/
  REVIEW/RETIRED and `SubmissionStatus` gained SIGNED (migration applied to the
  live DB). A global `AuditService` now writes `audit_log` (closes issue #1) on
  form create/publish/delete and submission complete/sign. Publish stores a
  SHA-256 content hash (immutability) with a `.../integrity` verify endpoint.
  jsonforms submissions are Ajv-2020-12-validated server-side on complete; a
  `sign` action locks a completed submission. Pure logic (content hash, Ajv
  validation) is unit-tested; a live-DB smoke exercised every new table/enum.
- **Phase 6 (done):** engine-targeted AI conversion pipeline. `conversion_job`
  tracks each run (PENDING→RUNNING→REVIEW|FAILED, background/no queue); the author
  picks the engine. FORMIO reuses AiBuilderService; JSONFORMS uses a dedicated
  prompt to emit split Data/UI/Print schemas + translations, the Data Schema is
  Ajv-2020-12 compile-checked, and per-field confidence/warnings persist to
  `conversion_warning`. A successful job creates a draft form (REVIEW) and
  audit-logs `ai.convert`. Assembler is unit-tested; a live-DB smoke ran the
  jsonforms path end-to-end with a stubbed provider. (Real LLM E2E needs a
  configured provider.)
- **Phase 7 (done):** prompt-based designer + review surface. Backend
  `DesignerService` refines a jsonforms form's artifacts from natural language
  (SSE, reusing the Form.io refine transport), Ajv-compile-checking the result and
  editing a draft in place (or forking one if published); `POST /conversions/:id/
  accept` promotes a reviewed draft REVIEW→DRAFT. Frontend `ReviewSurface`
  (packages/react-form-renderer, browser-verified in apps/react-demo) shows the
  live preview beside low-confidence fields + warnings from conversionMetadata,
  plus a refine box and accept action — no drag-and-drop. Productionizing the
  surface inside apps/web (React 19 + auth + SSE wiring + source-PDF pane) is the
  remaining integration step.
- **Phases 8–9 (planned):** print engine + visual-diff loop; docs/examples.
