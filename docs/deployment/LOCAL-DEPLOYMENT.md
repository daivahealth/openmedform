# Local Deployment Guide

> Step-by-step guide to set up and run OpenMedForm on your local machine.

---

## Table of Contents

- [Prerequisites](#prerequisites)
- [Clone the Repository](#clone-the-repository)
- [Environment Variables](#environment-variables)
- [Start Infrastructure (Docker)](#start-infrastructure-docker)
- [Install Dependencies](#install-dependencies)
- [Build Vendored Packages](#build-vendored-packages)
- [Database Setup](#database-setup)
- [Seed the Database](#seed-the-database)
- [Run the Application](#run-the-application)
- [Access the Application](#access-the-application)
- [Optional: Configure AI Providers](#optional-configure-ai-providers)
- [Optional: pgAdmin Setup](#optional-pgadmin-setup)
- [Troubleshooting](#troubleshooting)
- [Reference: Ports & Services](#reference-ports--services)
- [Reference: Useful Commands](#reference-useful-commands)

---

## Prerequisites

| Tool | Version | Purpose |
|------|---------|---------|
| [Node.js](https://nodejs.org/) | ≥ 20 | JavaScript runtime |
| [pnpm](https://pnpm.io/) | ≥ 9 | Package manager |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Latest | PostgreSQL, pgAdmin |
| [Git](https://git-scm.com/) | Latest | Version control |

### Verify Installation

```bash
node --version        # v20.x.x
pnpm --version        # 9.x.x
docker --version      # 24.x.x
docker compose version # v2.x.x
```

---

## Clone the Repository

```bash
git clone https://github.com/daivahealth/openmedform.git
cd openmedform
```

---

## Environment Variables

Create `.env` files for the infrastructure (root) and for the API service.

### 1. Root `.env` (Docker Compose)

Create `/openmedform/.env`:

```bash
# ─── Database ──────────────────────────────────────────────────────────────
POSTGRES_USER=openmedform
POSTGRES_PASSWORD=changeme
POSTGRES_DB=openmedform
POSTGRES_PORT=5433

# ─── Auth ──────────────────────────────────────────────────────────────────
JWT_SECRET=changeme-to-a-secure-random-string
JWT_EXPIRY=24h

# ─── App ───────────────────────────────────────────────────────────────────
PORT=3100
FRONTEND_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3100

# ─── Docker Compose (production) ──────────────────────────────────────────
# HTTP_PORT=80
# PGADMIN_EMAIL=admin@openmedform.dev
# PGADMIN_PASSWORD=admin123
# PGADMIN_PORT=5050
```

### 2. API `.env` (apps/api/.env)

Create `/openmedform/apps/api/.env`:

```bash
# ─── Database ──────────────────────────────────────────────────────────────
DATABASE_URL=postgresql://openmedform:changeme@localhost:5433/openmedform?schema=public

# ─── Auth ──────────────────────────────────────────────────────────────────
JWT_SECRET=changeme-to-a-secure-random-string
JWT_EXPIRY=24h

# ─── App ───────────────────────────────────────────────────────────────────
PORT=3100
FRONTEND_ORIGIN=http://localhost:3000
NEXT_PUBLIC_API_URL=http://localhost:3100

# ─── AI Provider Encryption ───────────────────────────────────────────────
# Required for encrypting/decrypting stored AI provider API keys.
# Must be at least 32 characters. Generate a new one with:
#   openssl rand -hex 32
AI_ENCRYPTION_KEY=d85b0e9a08043e344ee8c1a5f5a1a21ec8725220a26f98b2226ae61714d432ad
```

> ⚠️ **Important:** Replace `AI_ENCRYPTION_KEY` with your own generated key. Once set, changing it will invalidate all stored encrypted API keys.

### 3. Optional: AI Provider Keys (API `.env`)

Add any of the following to `/openmedform/apps/api/.env` if you want to use AI providers:

```bash
# ─── AI Builder — Provider Fallbacks ──────────────────────────────────────
# These are used only when no provider configs exist in the database.
# Configure providers via the Settings UI for per-tenant setups.

# Default provider (used when no DB configs exist)
AI_DEFAULT_PROVIDER=claude

# Anthropic Claude
AI_CLAUDE_API_KEY=sk-ant-...
AI_CLAUDE_MODEL=claude-sonnet-4-6

# OpenAI
AI_OPENAI_API_KEY=sk-...
AI_OPENAI_MODEL=gpt-4o

# MiniMax
AI_MINIMAX_API_KEY=...
AI_MINIMAX_MODEL=abab6.5-chat

# Kimi (Moonshot)
AI_KIMI_API_KEY=...
AI_KIMI_MODEL=moonshot-v1-8k

# Ollama (local)
AI_OLLAMA_BASE_URL=http://localhost:11434
AI_OLLAMA_MODEL=llama3
```

---

### 4. Optional: HTML mock-up rendering (API `.env`)

Converting an HTML mock-up that **builds its form at runtime** needs a headless
browser. The Docker image installs Chromium; a bare `npm run start:dev` has
none, so those uploads fall back to the static markup and are rejected with
"no headless browser is available in this deployment".

Point the API at any local Chrome/Chromium to enable it:

```bash
# macOS
CHROMIUM_PATH="/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"
# Linux
CHROMIUM_PATH=/usr/bin/chromium
```

| Variable | Effect |
|---|---|
| `CHROMIUM_PATH` | Browser executable. Unset → Playwright looks for its own download, which the repo does not install. |
| `HTML_RENDER_DISABLED=1` | Turns rendering off entirely and silences the startup warning. |
| `HTML_PROBE_DISABLED=1` | Keeps rendering but stops the sandbox pressing a mock-up's "Add …" controls. Costs click-built fields and the measured repeating-group split; see [PDF-TO-FORM](../features/PDF-TO-FORM.md#pressing-the-page-interaction-probing). |

Everything else converts fine without it — this only affects mock-ups whose
fields do not exist in the markup. See
[PDF-TO-FORM](../features/PDF-TO-FORM.md#mock-ups-that-build-their-form-with-javascript).

## Start Infrastructure (Docker)

Start only the database service for local development:

```bash
docker compose -f docker-compose.dev.yml up -d
```

This starts:
- **PostgreSQL 16** on `localhost:5433`

> ⚠️ The port is **5433** (not 5432) to avoid conflicts with any existing PostgreSQL instance.

### Container Health Check

```bash
docker ps --filter "name=openmedform-postgres"
```

Wait until the container shows `(healthy)` status.

---

## Install Dependencies

```bash
pnpm install
```

This installs all dependencies across the monorepo (workspaces in `apps/*` and `packages/*`).

---

## Database

### Run Migrations

```bash
pnpm --filter @openmedform/api prisma:migrate
```

Or directly:

```bash
cd apps/api
npx prisma migrate dev
cd ../..
```

This applies all existing migrations to the PostgreSQL database.

> If the migration fails with `P1010: User was denied access`, check that:
> - Docker is running
> - The PostgreSQL container is healthy
> - `.env` has the correct `DATABASE_URL` (including port 5433)

### Verify Migration

```bash
npx prisma migrate status --schema=apps/api/prisma/schema.prisma
```

---

## Seed the Database

```bash
pnpm --filter @openmedform/api prisma:seed
```

Or directly:

```bash
cd apps/api
npx tsx prisma/seed.ts
cd ../..
```

This creates:

| Item | Value |
|------|-------|
| **Tenant** | Default Organization |
| **Admin User** | `admin@openmedform.local` / `admin123` |
| **Sample Form** | VTE Risk Assessment (with scoring matrix, risk stratification, prophylaxis reference) |

> ⚠️ If the seed fails with a crypto error (`Unsupported state or unable to authenticate data`), there may be stale `ai_provider_config` records in the database encrypted with a previous key. Clear them:
> ```bash
> docker compose -f docker-compose.dev.yml exec -T postgres psql -U openmedform openmedform -c "DELETE FROM ai_provider_config;"
> ```

---

## Run the Application

### Start All Apps (Monorepo Dev Mode)

```bash
pnpm dev
```

This uses Turborepo to start all workspaces in parallel:

| Package | Mode | Port |
|---------|------|------|
| `@openmedform/api` | NestJS (watch) | 3100 |
| `@openmedform/web` | Next.js (dev) | 3000 |
| `@openmedform/renderer` | tsup (watch) | — |

### Start Individual Apps

```bash
# Backend only
cd apps/api && npm run start:dev

# Frontend only
cd apps/web && npm run dev

# Renderer only (package development)
cd packages/renderer && npm run dev
```

---

## Access the Application

| Service | URL | Credentials |
|---------|-----|-------------|
| **Web App** | [http://localhost:3000](http://localhost:3000) | `admin@openmedform.local` / `admin123` |
| **API** | [http://localhost:3100](http://localhost:3100) | — |
| **Prisma Studio** | [http://localhost:5555](http://localhost:5555) | Run `npx prisma studio` |
| **pgAdmin** | [http://localhost:5050](http://localhost:5050) | `admin@openmedform.dev` / `admin123` |

---

## Optional: Configure AI Providers

### Via Settings UI

1. Log in at [http://localhost:3000](http://localhost:3000)
2. Navigate to **AI Settings**
3. Click **Add Provider** and enter:
   - Provider type (Claude, OpenAI, MiniMax, Kimi, Ollama)
   - API key
   - Model (optional)
   - Base URL (required for Ollama)

Tenant users configure providers for their own organization. A `SUPER_ADMIN`
configures the global fallback provider set used by tenants without their own
configuration.

### Via Environment Variables

Configure providers in `apps/api/.env` using the fallback variables listed [above](#3-optional-ai-provider-keys-api-env). These are used when no database-stored configs exist.

### Supported Providers

| Provider | Type Value | API Key Format |
|----------|-----------|----------------|
| Anthropic Claude | `claude` | `sk-ant-...` |
| OpenAI | `openai` | `sk-...` |
| MiniMax | `minimax` | Custom |
| Kimi (Moonshot) | `kimi` | Custom |
| Ollama (local) | `ollama` | Base URL only |

---

## Optional: pgAdmin Setup

pgAdmin is included in the production `docker-compose.yml` but not in `docker-compose.dev.yml`. To use it in development:

```bash
docker run -d \
  --name openmedform-pgadmin \
  -p 5050:5050 \
  -e PGADMIN_DEFAULT_EMAIL=admin@openmedform.dev \
  -e PGADMIN_DEFAULT_PASSWORD=admin123 \
  -e PGADMIN_LISTEN_PORT=5050 \
  dpage/pgadmin4:latest
```

Then:

1. Open [http://localhost:5050](http://localhost:5050)
2. Login: `admin@openmedform.dev` / `admin123`
3. Add Server:
   - **Name:** OpenMedForm (local)
   - **Host:** `host.docker.internal` (macOS/Windows) or `172.17.0.1` (Linux)
   - **Port:** `5433`
   - **Username:** `openmedform`
   - **Password:** `changeme`

---

## Troubleshooting

### Port Conflicts

| Symptom | Fix |
|---------|-----|
| `port is already allocated` (5433) | Change `POSTGRES_PORT` in root `.env` and update `DATABASE_URL` in `apps/api/.env` |
| `port is already allocated` (3000) | Change web port: `cd apps/web && npm run dev -- -p 3001` |
| `port is already allocated` (3100) | Change `PORT` in `.env` |

### Database Connection Issues

**Error:** `P1010: User was denied access on the database`
```
Check:
  - Docker container is running:   docker ps
  - Port is correct in DATABASE_URL (should be 5433)
  - Credentials match .env values
```

**Error:** `Can't reach database server`
```
Verify:
  - Docker Desktop is running
  - docker compose -f docker-compose.dev.yml ps
  - Container status is "Up" and "(healthy)"
```

### Crypto / Decryption Errors

**Error:** `AI_ENCRYPTION_KEY must be set`

Add `AI_ENCRYPTION_KEY` to `apps/api/.env` (32+ characters).

**Error:** `Unsupported state or unable to authenticate data`

Stale encrypted records exist from a previous key. Clear the `ai_provider_config` table:

```bash
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U openmedform openmedform -c "DELETE FROM ai_provider_config;"
```

Then reconfigure providers via the Settings UI.

### Package Resolution Errors

### NestJS Build / TypeScript Errors

**Error:** `PrismaClient` / `UserRole` not exported

Run Prisma Client generation:

```bash
cd apps/api && npx prisma generate && cd ../..
```

**Error:** `Parameter 'c' implicitly has an 'any' type`

Run `prisma generate` — the type comes from the generated Prisma Client.

---

## Reference: Ports & Services

| Port | Service | Purpose |
|------|---------|---------|
| 5433 | PostgreSQL | Database (mapped from container port 5432) |
| 3000 | Next.js | Frontend web app |
| 3100 | NestJS | Backend API |
| 5050 | pgAdmin | Database admin UI (production only) |
| 80 | nginx | Reverse proxy (production only) |

---

## Reference: Useful Commands

### Docker

```bash
# Start database
docker compose -f docker-compose.dev.yml up -d

# Stop database
docker compose -f docker-compose.dev.yml down

# View logs
docker compose -f docker-compose.dev.yml logs -f postgres

# Reset database volume
docker compose -f docker-compose.dev.yml down -v
```

### Database (Prisma)

```bash
# Run migrations
pnpm --filter @openmedform/api prisma:migrate

# Create named migration
pnpm --filter @openmedform/api prisma:migrate --name add_field_x

# Seed data
pnpm --filter @openmedform/api prisma:seed

# Open Prisma Studio (GUI)
pnpm --filter @openmedform/api prisma:studio

# View migration status
cd apps/api && npx prisma migrate status
```

### Monorepo

```bash
# Install everything
pnpm install

# Add dependency to a specific workspace
pnpm --filter @openmedform/api add some-package

# Build everything
pnpm build

# Lint everything
pnpm lint

# Clean build artifacts
pnpm clean
```

### Direct Database Access

```bash
# Via psql (Docker)
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U openmedform openmedform

# Example queries
docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U openmedform openmedform -c "SELECT id, email, role FROM \"user\";"

docker compose -f docker-compose.dev.yml exec -T postgres \
  psql -U openmedform openmedform -c "SELECT id, name, status FROM form;"
```
