---
publish: false
---

# Developer Onboarding

## Prerequisites
- Node.js 20+
- pnpm 9+
- Docker and Docker Compose
- PostgreSQL 16 (via Docker or local)

## Setup

```bash
# Clone
git clone <repo-url> openmedform
cd openmedform

# Install dependencies
pnpm install

# Start PostgreSQL
docker compose -f docker-compose.dev.yml up -d

# Run migrations
pnpm --filter api prisma:migrate

# Seed database (creates default tenant + admin user)
pnpm --filter api prisma:seed

# Start all apps in dev mode
pnpm dev
```

## URLs
- Frontend: http://localhost:3000
- Backend API: http://localhost:3100
- PostgreSQL: localhost:5432

## Default Credentials (from seed)
- Email: admin@openmedform.local
- Password: admin123

## Common Commands

```bash
pnpm dev                    # Start all apps
pnpm build                  # Build everything
pnpm lint                   # Lint everything
pnpm --filter api prisma:migrate    # Run migrations
pnpm --filter api prisma:seed       # Seed database
pnpm --filter api prisma:studio     # Open Prisma Studio
pnpm --filter web dev               # Frontend only
pnpm --filter api start:dev         # Backend only
```

## Monorepo Structure
- `apps/api` — NestJS backend
- `apps/web` — Next.js frontend

### Form platform (JSON Forms — see [ADR-004](../ADR/004-remove-formio-engine.md))
- `packages/form-schema-types` — Data/UI/Print schema + FormDefinition contracts
- `packages/form-core` — framework-independent engine (Ajv 2020-12 validation,
  `$ref`/scope resolution, binding, conditional rules, i18n, control registry,
  serialization); no React/Angular imports
- `packages/form-design-tokens` — shared `--omf-*` CSS variables + TS tokens for
  cross-framework visual parity
- `packages/react-form-renderer` — React renderer: `<FormRenderer
  definition={...} />` over `@jsonforms/react` + the custom clinical controls
- `packages/angular-form-renderer` — Angular 20 standalone JSON Forms renderer
  (`<omf-form [definition]="...">`): custom token-styled renderers over
  `@jsonforms/angular`, no Angular Material
- `packages/form-print-engine` — reconstructs A4 print HTML/CSS (`@page` in mm)
  from a jsonforms definition + pure visual-diff primitives (`comparePixels`,
  `runVisualDiffLoop`). HTML→PDF/image rasterization (Playwright/Chromium or
  WeasyPrint) is injected at deployment, not bundled.
- `apps/react-demo` — Vite demo rendering sample forms through the
  dispatcher: `pnpm --filter @openmedform/react-demo dev` (http://localhost:5175)
- `apps/angular-demo` — Angular demo (Analog + Vite) rendering the same jsonforms
  reference the React demo does. It consumes the renderer library as source, and
  Analog's dev server can't compile cross-package source, so run it as a build +
  preview: `pnpm --filter @openmedform/angular-demo build` then
  `pnpm --filter @openmedform/angular-demo preview` (http://localhost:5176)

> Note: a root `pnpm.overrides` pins a single `@types/react` (19.x) across the
> workspace. This is required — apps/web is on React 19 while the renderer
> packages target React 18, and two `@types/react` copies otherwise clash
> (the "bigint ReactNode" JSX type error).
