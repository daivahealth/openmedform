# AGENTS.md — OpenMedForm

Operating contract for AI coding agents working in this repository. This file is materially aligned with `CLAUDE.md` — any update to one must be reflected in the other in the same session.

## What This Project Is

OpenMedForm is an **AI-powered clinical form builder platform**. It enables healthcare organizations to create, manage, and deploy complex clinical assessment forms with scoring logic, conditional sections, and reference tables.

- Drag-and-drop form builder (forked formio.js, MIT licensed)
- AI-powered form generation (multi-provider LLM support)
- Form rendering, submission management, and versioning
- Server-side scoring engine for clinical risk calculations
- Multi-tenant SaaS with RBAC and audit logging

## Documentation Hierarchy

- Root `AGENTS.md` / `CLAUDE.md`: agent operating rules
- `docs/README.md`: documentation entrypoint
- `docs/architecture/`: system design, data model
- `docs/ADR/`: architecture decisions
- `docs/api/`: API contracts, endpoints, DTOs
- `docs/features/`: form builder, AI builder, scoring engine
- `docs/development/`: dev setup, commands, coding patterns
- `docs/deployment/`: Docker Compose
- `docs/security/`: auth, RBAC, audit logging, LLM key handling

## Core Rules

### Engineering
- Explore before editing. Read relevant code and docs first.
- Follow existing patterns. Prefer small, coherent changes.
- Keep service boundaries explicit. Preserve multi-tenant safety, auth, and auditability.
- Do not invent new abstractions if existing ones cover the use case.

### Backend (NestJS + Prisma + PostgreSQL)
- Follow controller → service → repository via PrismaService pattern.
- Keep tenant-aware filters on all domain queries (always filter by `tenant_id`).
- Use Prisma for all database access. No raw SQL except in migrations or seeds.
- Document changes to: endpoints, DTOs, auth/headers, multitenancy, migrations.

### Frontend (Next.js 14 + Radix UI + Tailwind)
- Use existing API clients, query hooks, stores, and UI primitives first.
- Keep branding aligned with shared theme tokens.
- Document changes to: routes, form workflows, features, API usage.

### Database & Security
- All queries scoped by `tenant_id`. No cross-tenant data leaks.
- All user actions audit-logged.
- JWT stateless auth. bcrypt for passwords.
- Schema changes require: impact awareness, affected modules, migration plan, doc updates.

### AI Builder
- LLM API keys: environment variables ONLY. Never in code, git, or logs.
- All providers implement `LlmProvider` interface. No ad-hoc API calls.
- Generated schemas always pass through SchemaValidator before client delivery.
- No `eval()` or `Function()` for scoring. Deterministic scoring engine only.
- Prompts live in `src/modules/ai-builder/prompts/`. Never inline in service code.

### Form Engine
- Form schemas stored as JSON in `form_version.schema`.
- Published versions are immutable. Edits create new draft versions.
- Submissions reference exact `form_version_id`.
- Scores recalculated server-side on completion. Never trust client values.

## Documentation First

- Changes affecting architecture, APIs, workflows, or security must update docs in the same session.
- Check existing docs before creating new ones. Prefer updating canonical docs.
- No silent drift: code and docs must not contradict each other.
- No sprawl: no one-off summary docs, no duplicate content across doc families.

## Technology Stack

| Component | Technology | Version |
|-----------|-----------|---------|
| Backend | NestJS | ^10 |
| ORM | Prisma | ^6 |
| Database | PostgreSQL | 16 |
| Frontend | Next.js (App Router) | 14 |
| Form Engine | formio.js (forked) | ^5 |
| Form React | @formio/react (forked) | ^6 |
| UI | Radix UI + Tailwind CSS | Latest |
| State | Zustand + React Query v5 | Latest |
| Monorepo | Turborepo + pnpm | Latest |
| Deployment | Docker Compose | v2 |

## Dos

- Do inspect relevant docs before implementing.
- Do update canonical docs when behavior changes.
- Do preserve service boundaries, shared contracts, and tenant context.
- Do prefer existing shared utilities, clients, hooks, and components.
- Do mention any discovered code/doc mismatch in your final report.

## Don'ts

- Don't duplicate content already in `docs/`.
- Don't create summary/status/completion markdown files.
- Don't bypass shared API clients, DTOs, or theme tokens.
- Don't make auth, tenant-safety, or schema changes without aligned documentation.
- Don't leave code and docs contradictory without surfacing it.
- Don't store LLM API keys in code or logs.
- Don't use `eval()` for scoring.
- Don't modify published form versions.
- Don't trust client-calculated scores.
