FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/api/package.json apps/api/
RUN pnpm install --frozen-lockfile --filter @openmedform/api...

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/api/node_modules ./apps/api/node_modules
COPY apps/api/ apps/api/
WORKDIR /app/apps/api
RUN npx prisma generate
RUN npx nest build

# --- runtime ---
FROM node:20-alpine AS runtime
# poppler-utils provides pdftoppm, used to render PDF pages to images for the
# vision-based AI conversion pipeline (falls back to text extraction if absent).
RUN apk add --no-cache poppler-utils
WORKDIR /app

# pnpm layout: apps/api/node_modules holds relative symlinks into the root
# virtual store (node_modules/.pnpm), which is also where `prisma generate`
# puts the generated client — copy both, from the build stage so the client
# is present.
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/api/package.json ./apps/api/package.json
COPY --from=build /app/apps/api/node_modules ./apps/api/node_modules
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/apps/api/prisma ./apps/api/prisma

WORKDIR /app/apps/api
ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); main.ts binds to it when set.
ENV PORT=3100
EXPOSE 3100

CMD ["sh", "-c", "npx prisma migrate deploy && node dist/src/main.js"]
