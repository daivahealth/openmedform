# Technical Architecture

## Overview

OpenMedForm is a monorepo of applications, demos and shared packages. JSON Forms
is the only form engine ([ADR-004](../ADR/004-remove-formio-engine.md)).

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
