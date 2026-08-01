# ADR-004: Remove the Form.io engine — JSON Forms only

## Status

Accepted (2026-08-01). **Supersedes [ADR-001](001-formio-js-fork.md)** (fork
formio.js) and **[ADR-003](003-dual-engine-json-forms.md)** (keep both engines).

## Context

ADR-003 locked in a *dual-engine* platform: the forked Form.io engine preserved
alongside a new JSON Forms engine, selected per form by an `engine`
discriminator. That was the right call while JSON Forms was unproven — it let
the new path be built without putting existing forms at risk.

It is no longer the right call:

- **JSON Forms carries the real workload.** Every form in the system is
  `JSONFORMS`, and the clinical control set (scored checklists, checklist
  matrices, column tables, record tables, tabbed record detail, score summaries
  with risk bands) is only implemented there.
- **The dual-engine tax was real, and ADR-003 predicted it.** Every clinical
  control, print path, scoring extraction and test potentially existed for
  2 engines × 2 frameworks. Form.io × Angular was never viable at all, which is
  why the EMR integration has always been JSON Forms.
- **Weight.** `packages/formio-core` alone is ~46 MB of vendored fork, with a
  Docker build step and a webpack alias existing solely to make its CJS build
  loadable. `packages/formio-react` did not even compile, and broke repo-wide
  `pnpm build`.

## Decision

Remove the Form.io engine entirely. JSON Forms — separated Data / UI / Print
schemas — is the only engine.

Deleted: `packages/formio-core`, `packages/formio-react`, `packages/renderer`
(the Form.io-only EMR renderer), the drag-and-drop builder and its six Form.io
clinical components, the Form.io AI generation path (`pdf-to-form-prompt`,
`system-prompt`, `component-catalog`, `schema-assembler`, `schema-validator`,
`schema-preview-renderer` and the visual-QA repair pass), and the
`FormEngine` discriminator across the contracts, the database and the renderers.

## Consequences

### There is no drag-and-drop builder

`/forms/:id/builder` is gone. It was Form.io-only — JSON Forms forms already
redirected off it to the prompt-based designer — but the capability itself is
now absent from the product. Form authoring is:

1. **Convert** a PDF, image or HTML mock-up (`POST /api/conversions`), or
2. **Describe** the form in natural language (`POST /api/forms/from-prompt`),

then **refine by prompt** in the designer
(`POST /api/forms/:id/jsonforms/refine`). Reintroducing visual editing means
building it against JSON Forms; it is not a matter of re-enabling anything.

### Removed endpoints

| Endpoint | Replacement |
|---|---|
| `POST /api/forms/from-file` | `POST /api/conversions` |
| `POST /api/forms/from-pdf` | `POST /api/conversions` |
| `POST /api/ai/generate-from-pdf` | `POST /api/conversions` |
| `POST /api/ai/generate` | `POST /api/forms/from-prompt` |
| `POST /api/ai/refine`, `POST /api/forms/:id/ai/refine` | `POST /api/forms/:id/jsonforms/refine` |
| `PUT /api/forms/:id/schema` | designer refine (no coupled schema to save) |
| `GET /api/forms/:id/export/formio` | `GET /api/forms/:id/export` |

`POST /api/forms/from-prompt` was **kept and re-pointed** at JSON Forms rather
than deleted: describing a form is a capability in its own right and has nothing
to do with which engine renders the result. `GET /api/ai/providers` also stays —
provider discovery is engine-independent.

`POST /api/forms/import` now **rejects** a Form.io template with a clear message
instead of half-importing it. Templates predating the `engine` field are Form.io
by origin and are rejected too.

### Database

Migration `20260801080000_remove_formio_engine` drops `form_version.engine`,
`form_version.schema`, `conversion_job.engine_target` and the `form_engine_enum`
type.

It **guards first**: a `DO $$ … RAISE EXCEPTION` block aborts the whole
migration (and the deploy) if any `form_version` row still has
`engine = 'FORMIO'` or a non-null `schema`. Dropping `schema` destroys the only
copy of a Form.io form's definition, so failing loudly is the correct behaviour —
verified against a scratch database holding a Form.io row: the migration
aborted and left both the row and the enum intact.

**Published content hashes are unaffected.** `versionPayload()` still emits the
literal `engine: 'JSONFORMS'`, frozen deliberately: the hash of an
already-published version must keep recomputing to the same value or
`GET /forms/:id/versions/:versionId/integrity` would report every existing
published form as tampered with.

### Published packages (breaking, v1.0.0)

`FormDefinition` is no longer a discriminated union. The `engine` field, the
`FormEngine` type and the `isFormioDefinition` / `isJsonFormsDefinition`
narrowing helpers are gone; `JsonFormsFormDefinition` remains as an alias so
existing imports resolve. `FormRenderer` keeps its name and props minus
`patientContext` and `onSubmit`, which belonged to the Form.io branch — a host
now renders its own submit control.

`@openmedform/react-form-renderer/jsonforms` is kept as an alias of the package
root, which is now Form.io-free by construction.

### What got better

- `pnpm build` passes repo-wide for the first time in a while — the failure was
  `formio-react`.
- The web Dockerfile loses two pre-build steps; `next.config.mjs` loses its
  webpack alias; the react demo loses its Vite alias and CJS pre-bundling.
- One conversion path, one renderer contract, one set of clinical controls.

### Risk accepted

Any Form.io form that exists in an environment not visible from this repo cannot
be rendered after this change. The migration guard turns that from silent data
loss into a failed deploy, which is the intended trade.
