FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
COPY packages/shared/package.json packages/shared/ 2>/dev/null || true
RUN pnpm install --frozen-lockfile --filter @openmedform/api...

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/ apps/api/
COPY packages/ packages/
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx nest build

# --- runtime ---
FROM node:20-alpine AS runtime
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

COPY --from=build /app/apps/api/dist ./dist
COPY --from=build /app/apps/api/prisma ./prisma
COPY --from=build /app/apps/api/package.json ./
COPY --from=deps /app/apps/api/node_modules ./node_modules
COPY --from=build /app/apps/api/node_modules/.prisma ./node_modules/.prisma

ENV NODE_ENV=production
ENV PORT=3100
EXPOSE 3100

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/main.js"]
