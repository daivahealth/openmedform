FROM node:20-alpine AS base
RUN corepack enable && corepack prepare pnpm@9 --activate
WORKDIR /app

# --- deps ---
FROM base AS deps
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/package.json apps/web/
# Workspace packages the web app depends on (pnpm needs their manifests to
# resolve workspace:* and run a filtered install).
COPY packages/form-core/package.json packages/form-core/
COPY packages/form-design-tokens/package.json packages/form-design-tokens/
COPY packages/form-print-engine/package.json packages/form-print-engine/
COPY packages/form-schema-types/package.json packages/form-schema-types/
COPY packages/react-form-renderer/package.json packages/react-form-renderer/
COPY packages/shared/package.json packages/shared/
RUN pnpm install --frozen-lockfile --filter @openmedform/web...

# --- build ---
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY --from=deps /app/apps/web/node_modules ./apps/web/node_modules
# Root manifests must be present or Next's standalone output flattens the
# traced app path (server.js lands at the standalone root).
COPY pnpm-lock.yaml pnpm-workspace.yaml package.json ./
COPY apps/web/ apps/web/
COPY packages/ packages/
# The filtered install also created node_modules inside each workspace
# package (symlinks resolving workspace:* deps); .dockerignore excludes them
# from the context copy above, so overlay them from the deps stage.
COPY --from=deps /app/packages/ packages/

ARG NEXT_PUBLIC_API_URL=http://localhost:3100
ENV NEXT_PUBLIC_API_URL=$NEXT_PUBLIC_API_URL

WORKDIR /app
# Every first-party package ships as TS source and is transpiled by Next
# (transpilePackages in next.config.mjs), so there is no pre-build step.
RUN pnpm --filter @openmedform/web run build

# --- runtime ---
FROM node:20-alpine AS runtime
WORKDIR /app

# outputFileTracingRoot is the workspace root, so the standalone server lives
# at apps/web/server.js inside the standalone output, and static assets must
# be placed alongside it.
COPY --from=build /app/apps/web/.next/standalone ./
COPY --from=build /app/apps/web/.next/static ./apps/web/.next/static
COPY --from=build /app/apps/web/public ./apps/web/public

ENV NODE_ENV=production
# Cloud Run injects PORT (default 8080); Next standalone binds to it when set.
ENV PORT=3000
ENV HOSTNAME=0.0.0.0
EXPOSE 3000

CMD ["node", "apps/web/server.js"]
