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
- `packages/formio-core` — forked formio.js (`@openmedform/formio-core`)
- `packages/formio-react` — forked @formio/react (`@openmedform/formio-react`)
- `packages/shared` — shared types (`@openmedform/shared`)
- `apps/api` — NestJS backend
- `apps/web` — Next.js frontend
