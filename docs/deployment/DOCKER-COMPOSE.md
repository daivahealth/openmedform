# Docker Compose Deployment

## Services

| Service | Image | Port | Purpose |
|---------|-------|------|---------|
| postgres | postgres:16-alpine | 5432 | Database |
| api | apps/api (built) | 3100 | NestJS backend |
| web | apps/web (built) | 3000 | Next.js frontend |

## Environment Variables

### Required
- `POSTGRES_PASSWORD` — database password
- `JWT_SECRET` — JWT signing secret

### Optional
- `POSTGRES_USER` — default: openmedform
- `POSTGRES_DB` — default: openmedform
- `FRONTEND_ORIGIN` — default: http://localhost:3000
- `AI_CLAUDE_API_KEY` — Anthropic API key
- `AI_OPENAI_API_KEY` — OpenAI API key
- `AI_DEFAULT_PROVIDER` — default: claude

## Commands

```bash
# Production
docker compose up -d
docker compose exec api npx prisma migrate deploy
docker compose exec api npx prisma db seed

# Development (postgres only)
docker compose -f docker-compose.dev.yml up -d
```
