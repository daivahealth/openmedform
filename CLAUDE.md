# CLAUDE.md — OpenMedForm

Operating contract for Claude and other AI coding agents working in this repository.

This file is intentionally policy-heavy. It defines how agents should work, which documents are authoritative, when documentation updates are mandatory, and which engineering constraints must not be violated.

## Companion File Sync

- `AGENTS.md` and `CLAUDE.md` must stay materially aligned.
- Any update to one file must be reflected in the other in the same session.
- Do not change agent operating rules in only one of these files.

## What This Project Is

OpenMedForm is an **AI-powered clinical form builder platform**. It enables healthcare organizations to create, manage, and deploy complex clinical assessment forms (e.g., VTE risk assessments, falls risk evaluations, consent forms) with scoring logic, conditional sections, and reference tables.

**It IS:**
- A drag-and-drop form builder for complex clinical forms (based on a forked formio.js)
- An AI-powered form generation engine (multi-provider LLM: Claude, OpenAI, Minimax, Kimi, Ollama)
- A form rendering and submission management platform
- A versioned form schema store with immutable published versions
- A multi-tenant SaaS platform with role-based access control
- A server-side scoring engine for clinical risk calculations

**It is NOT:**
- An EMR/EHR system
- A clinical decision support system (it calculates scores, not recommendations)
- A patient-facing portal (forms are filled by clinicians)
- A data analytics or reporting platform

## Purpose

- Use this file as the top-level ruleset for agent behavior in `openmedform`.
- Use the `docs/` tree as the detailed source of truth for architecture, APIs, workflows, runbooks, and developer guidance.
- Do not treat this file as the place to restate all architecture or feature detail already documented elsewhere.

## Documentation Hierarchy

- Root `AGENTS.md`: operating rules for agents.
- Root `CLAUDE.md`: same operating rules for Claude-oriented workflows.
- [docs/README.md](docs/README.md): documentation entrypoint and navigation.
- [docs/CONTRIBUTING.md](docs/CONTRIBUTING.md): documentation writing standards and contribution guidance.
- [docs/architecture/](docs/architecture): system architecture, technical design, and data model.
- [docs/ADR/](docs/ADR): architecture decisions and decision history.
- [docs/api/](docs/api): API contracts, endpoint behavior, and integration references.
- [docs/features/](docs/features): feature behavior, form builder, AI builder, scoring engine.
- [docs/development/](docs/development): engineering workflow, commands, and implementation guidance.
- [docs/deployment/](docs/deployment): Docker Compose, nginx configuration.
- [docs/security/](docs/security): security, RBAC, audit logging, LLM API key handling.

## Documentation First Policy

Agents must treat documentation updates as part of the implementation, not optional follow-up.

- Any change affecting architecture, API contracts, workflows, developer expectations, operational behavior, or security assumptions must update the appropriate docs in the same session.
- If a code change does not require a doc update, the agent should be able to justify that clearly.
- If code and docs already disagree, the agent must call it out explicitly and either reconcile them or stop and surface the mismatch.
- Agents must check existing documentation before creating new docs.
- Prefer updating an existing canonical doc over creating a new file.

## Documentation Routing Rules

When a change is made, update the correct documentation family.

- Architecture, data model, integration patterns, or system design changes: `docs/ADR/`, `docs/architecture/`
- API shape, endpoint semantics, auth/header expectations, request/response changes: `docs/api/`
- Feature behavior, form builder, AI builder, scoring rules: `docs/features/`
- Developer setup, local workflow, commands, coding patterns: `docs/development/`
- Docker Compose, nginx changes: `docs/deployment/`
- Auth, RBAC, audit logging, LLM API key handling: `docs/security/`

## No Silent Drift

- Do not leave behavior-changing code without aligned documentation.
- Do not change an API, workflow, or architecture rule and leave older docs misleading.
- Do not cite docs as authoritative if the implementation now contradicts them.
- If a mismatch is too large to safely reconcile in the current task, stop and report it.

## No Documentation Sprawl

- Do not create one-off summary docs, completion reports, or fix-status docs by default.
- Do not create a new markdown file if an existing canonical doc can absorb the change.
- Do not duplicate the same content across `features`, `api`, and `deployment`.
- Use new docs only when the topic is genuinely new and does not already have a natural home.

## Repository Orientation

```text
openmedform/
├── packages/
│   ├── formio-core/            # Forked formio.js → @openmedform/formio-core
│   │   └── src/
│   │       └── components/
│   │           └── clinical/   # Custom clinical components (ScoringMatrix, etc.)
│   ├── formio-react/           # Forked @formio/react → @openmedform/formio-react
│   └── shared/                 # Shared types, constants, scoring engine types
├── apps/
│   ├── api/                    # NestJS 10 backend
│   │   ├── prisma/             # Prisma schema, migrations, seed
│   │   └── src/
│   │       ├── common/         # Guards, decorators, filters, interceptors
│   │       ├── database/       # PrismaService and PrismaModule
│   │       └── modules/        # Feature modules
│   │           ├── auth/
│   │           ├── tenant/
│   │           ├── user/
│   │           ├── form/
│   │           ├── submission/
│   │           ├── ai-builder/ # AI form generation (multi-provider LLM)
│   │           └── health/
│   └── web/                    # Next.js 14 App Router frontend
│       └── src/
│           ├── app/            # Route pages and layouts
│           ├── components/     # UI primitives, layout, feature components
│           ├── hooks/          # Shared React hooks
│           ├── lib/            # API client, stores, utilities
│           └── providers/      # React context providers
├── docs/                       # Canonical documentation tree
└── docker-compose.yml
```

## Core Engineering Rules

- Explore before editing. Read the relevant code and the relevant docs first.
- Follow existing patterns unless there is a strong documented reason to change them.
- Prefer small, coherent changes over broad speculative refactors.
- Keep service boundaries explicit. Do not blur backend domain ownership.
- Preserve multi-tenant safety, auth expectations, and auditability.
- Do not invent new abstractions if an existing shared client, hook, service, DTO, or utility already covers the use case.

## Backend Rules

- Follow NestJS patterns already used in the repo (controller → service → repository via PrismaService).
- Use existing DTOs and shared contracts where possible.
- Keep tenant-aware filters and request context intact on all domain operations.
- Use service-local database boundaries. Do not introduce implicit cross-service joins.
- Use Prisma for all database access. Do not introduce raw SQL except in migrations or seed scripts.
- Document any change to:
  - endpoint behavior
  - DTO/schema shape
  - auth/header expectations
  - multitenancy rules
  - database migration impact

## Frontend Rules

- Use existing API clients, query hooks, stores, and UI primitives before adding new ones.
- Keep branding, theme, and interaction changes aligned with shared theme tokens and shared components.
- Do not hardcode new API access paths if the existing service/client layer is the correct seam.
- Document any change to:
  - route behavior
  - form workflow
  - user-facing feature behavior
  - API usage expectations

## Database, Security, and Multitenancy Rules

- All domain queries must be scoped by `tenant_id`.
- No cross-database joins as a shortcut for feature delivery.
- Required headers and tenant/facility context rules must be preserved.
- Schema changes must include:
  - impact awareness
  - affected services/modules
  - seed or migration implications
  - documentation updates in the correct doc family
- All user actions must be audit-logged (login, form create/edit/publish, submission, AI generation).
- JWT auth is stateless. No token blacklist.
- bcrypt for password hashing (not argon2).
- Security-sensitive changes must be reflected in `docs/security/` or related canonical docs.

## AI Builder Rules

- LLM API keys must NEVER be stored in code, committed to git, or logged. Use environment variables only.
- LLM provider implementations must implement the `LlmProvider` interface — no ad-hoc API calls.
- Generated form schemas must always pass through the SchemaValidator before being returned to the client.
- Never use `eval()` or `Function()` for scoring logic — use the deterministic scoring engine only.
- LLM prompts (system prompt, few-shot examples) live in `src/modules/ai-builder/prompts/` — do not inline them in service code.
- All AI generation requests must be audit-logged with provider, model, and token usage.

## Form Engine Rules

- Form schemas are stored as JSON in `form_version.schema`. This is the single source of truth.
- Published form versions are immutable. Editing after publish creates a new draft version.
- Every submission must reference the exact `form_version_id` it was filled against.
- Scoring is recalculated server-side on submission completion — never trust client-calculated scores.
- Custom clinical components must extend formio.js base classes and register via `Formio.registerComponent()`.

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

## Development Workflow

### Backend
```bash
cd apps/api
npm install
npx prisma generate
npx prisma migrate dev
npm run start:dev
```

### Frontend
```bash
cd apps/web
npm install
npm run dev
```

### Full Monorepo
```bash
pnpm install
pnpm dev          # starts all apps
pnpm build        # builds all packages and apps
pnpm lint         # lints all packages and apps
```

### Docker
```bash
docker compose up -d                                    # start all services
docker compose exec api npx prisma migrate deploy       # run migrations
docker compose exec api npx prisma db seed              # seed database
docker compose logs -f api                              # tail API logs
```

## Dos

- Do inspect relevant docs before implementing.
- Do update the correct canonical docs in the same session when behavior changes.
- Do preserve existing service boundaries, shared contracts, and tenant context patterns.
- Do prefer existing shared utilities, clients, hooks, and components.
- Do mention any discovered code/doc mismatch in your final report.
- Do document migration, schema, or operational impact when relevant.

## Don'ts

- Don't duplicate architecture or feature detail already covered in `docs/`.
- Don't create summary/status/completion markdown files by default.
- Don't invent new architecture when ADRs or architecture docs already define the direction.
- Don't bypass shared API clients, request-context patterns, DTOs, or theme tokens without strong reason.
- Don't make auth, tenant-safety, API-shape, or schema changes without aligned documentation.
- Don't leave code and docs in a contradictory state without explicitly surfacing it.
- Don't store LLM API keys in code or logs.
- Don't use `eval()` or `Function()` for scoring — use the deterministic scoring engine.
- Don't modify published form versions — create new versions instead.
- Don't trust client-calculated scores — always recalculate server-side.

## Verification Checklist

Before closing a task, the agent should verify:

- What behavior changed?
- Which existing docs were checked before implementation?
- Which canonical docs were updated?
- What was verified locally?
- Does any known code/doc mismatch remain?
- Are tenant isolation and audit logging intact?

## Key References

- [docs/README.md](docs/README.md)
- [docs/architecture/TECHNICAL-ARCHITECTURE.md](docs/architecture/TECHNICAL-ARCHITECTURE.md)
- [docs/architecture/DATA-MODEL.md](docs/architecture/DATA-MODEL.md)
- [docs/api/README.md](docs/api/README.md)
- [docs/features/FORM-BUILDER.md](docs/features/FORM-BUILDER.md)
- [docs/features/AI-BUILDER.md](docs/features/AI-BUILDER.md)
- [docs/security/AUTH-AND-RBAC.md](docs/security/AUTH-AND-RBAC.md)
- [docs/deployment/DOCKER-COMPOSE.md](docs/deployment/DOCKER-COMPOSE.md)
- [docs/development/DEVELOPER-ONBOARDING.md](docs/development/DEVELOPER-ONBOARDING.md)
