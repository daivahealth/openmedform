---
publish: true
description: "System architecture of the OpenMedForm platform: services, packages, and how they fit together."
---

# Technical Architecture

## Overview

OpenMedForm is a monorepo of applications, demos and shared packages. JSON Forms
is the only form engine — see
[ADR-003](../ADR/003-json-forms-platform.md) for the platform architecture.

```
openmedform/
├── apps/api                    NestJS 10 backend (REST API, auth, scoring, AI conversion)
├── apps/web                    Next.js 14 frontend (forms, designer, renderer, dashboard)
├── apps/react-demo             Standalone React renderer demo
├── apps/angular-demo           Standalone Angular renderer demo
├── packages/form-schema-types  Data / UI / Print schema contracts + the `omf` vocabulary
├── packages/form-core          Framework-independent engine (Ajv validation, scoring, binding)
├── packages/form-design-tokens Shared CSS variables — React/Angular visual parity
├── packages/react-form-renderer   React renderer + clinical controls
├── packages/angular-form-renderer Angular renderer + the same controls
└── packages/form-print-engine  UI/Print schema → A4 HTML/CSS → PDF
```

## System Architecture

```
┌─────────────────────────────────┐
│         Browser (Next.js)        │
│  ┌───────────┐  ┌─────────────┐ │
│  │ Renderer  │  │ AI Designer │ │
│  │ + Designer│  │ Panel       │ │
│  │(JSONForms)│  │             │ │
│  └─────┬─────┘  └──────┬──────┘ │
│        │               │        │
└────────┼───────────────┼────────┘
         │               │
    REST API calls   REST API calls
         │               │
┌────────┼───────────────┼────────┐
│        ▼               ▼        │
│  ┌───────────┐  ┌─────────────┐ │
│  │ Form      │  │ AI Builder  │ │
│  │ Module    │  │ Module      │ │
│  └─────┬─────┘  └──────┬──────┘ │
│        │               │        │
│        ▼               ▼        │
│  ┌──────────┐  ┌──────────────┐ │
│  │ Prisma   │  │ LLM Provider │ │
│  │ (PG)     │  │ Registry     │ │
│  └──────────┘  └──────────────┘ │
│         NestJS Backend           │
└──────────────────────────────────┘
```

## Runtime Dependencies (apps/api)

Two native binaries ship in the API image. Both are **optional**: the feature
degrades rather than failing if either is absent.

| Binary | Package | Used for | Without it |
|---|---|---|---|
| `pdftoppm` | `poppler-utils` | Rendering PDF pages to PNG so a vision-capable LLM can read layout during conversion | Falls back to embedded text extraction |
| `chromium` | `chromium` | Executing HTML mock-ups that build their form at runtime, so the generated fields can be read | Falls back to the static markup |

### Why Chromium

An AI-generated HTML mock-up routinely builds its whole form from a config
array at load time. The markup is then a heading, an empty `<tbody>`, and
nothing else — there is literally nothing to convert. Executing the page turns
those config arrays back into real `<input>`/`<select>` elements.

Uploaded files are untrusted, so **rendering is deliberately not trusting**:

- **Chromium's OS-level sandbox is the isolation boundary.** Uploaded script is
  never evaluated in the API process. `--no-sandbox` is never passed; jsdom was
  rejected because it would run untrusted code inside Node.
- **No network.** The context is `offline`, all requests are aborted by a
  catch-all route, and content is injected via `setContent` rather than
  navigated to — the page has no origin to fetch from.
- **Bounded:** 10s cap, downloads refused, pop-ups closed, context torn down.
- **Re-sanitised:** the rendered DOM goes back through the same extractor as any
  static upload — scripts stripped, attribute allow-list enforced, hidden
  content removed.

Implementation:
[`html-render.ts`](../../apps/api/src/common/utils/html-render.ts). Full
rationale and threat model: [ADR-003](../ADR/003-json-forms-platform.md).

**Operational notes**

- Alpine images use the distro `chromium` package (Playwright's bundled build
  does not support Alpine), located via `CHROMIUM_PATH`.
- `HTML_RENDER_DISABLED=1` turns rendering off entirely.
- `HTML_PROBE_DISABLED=1` keeps rendering but stops the sandbox pressing the
  page's "Add …" controls (interaction probing).
- Allow **≥1 GiB** per API instance; Chromium is short-lived but not free.
- Local development and CI need neither binary.

> The print/visual-diff loop still expects a **separately injected** rasterizer.
> Chromium is present and could serve it, but that wiring is an open task.

## Multi-Tenancy

Row-level isolation via `tenant_id` on all domain tables. The JWT payload carries `tenantId`, extracted by a `TenantGuard` and passed to all service methods.

## Form Schema Lifecycle

1. Form created → FormVersion v1 (draft, empty schema)
2. Designer edits → draft version updated via auto-save
3. Designer publishes → `published_at` set, version becomes immutable
4. Further edits → new FormVersion v(N+1) created as draft
5. Submissions reference the exact `form_version_id` they were filled against

## Scoring Architecture

- Client-side: the renderers compute live subtotals and the score summary from
  `options.omf.points` via the shared `form-core` scoring module — advisory only
- Server-side: the deterministic scoring engine recalculates on submission
  completion and is authoritative (no `eval()`)
- Both sides share one implementation in `form-core`, so a score cannot differ
  between the screen and the stored record
