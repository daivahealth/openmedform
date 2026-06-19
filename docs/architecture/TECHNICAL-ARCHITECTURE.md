# Technical Architecture

## Overview

OpenMedForm is a monorepo containing two applications and three shared packages:

```
openmedform/
├── apps/api        NestJS 10 backend (REST API, auth, scoring engine, AI builder)
├── apps/web        Next.js 14 frontend (form builder, renderer, dashboard)
├── packages/formio-core     Forked formio.js — form builder + renderer engine
├── packages/formio-react    Forked @formio/react — React bindings
└── packages/shared          Shared TypeScript types and constants
```

## System Architecture

```
┌─────────────────────────────────┐
│         Browser (Next.js)        │
│  ┌───────────┐  ┌─────────────┐ │
│  │ Form      │  │ AI Chat     │ │
│  │ Builder   │  │ Panel       │ │
│  │ (formio)  │  │             │ │
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

- Client-side: formio.js calculated values provide live feedback in the builder/renderer
- Server-side: deterministic scoring engine recalculates on submission completion
- Scoring rules extracted from form schema at publish time (no `eval()`)
