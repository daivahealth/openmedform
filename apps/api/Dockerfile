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
#
# chromium renders HTML mock-ups that build their form at runtime, so the
# generated fields can be read (see common/utils/html-render.ts). Playwright's
# bundled build does not support Alpine, so the distro package is used and
# playwright-core is pointed at it via CHROMIUM_PATH. Set HTML_RENDER_DISABLED=1
# to turn the feature off; conversion then falls back to the static markup.
RUN apk add --no-cache \
      poppler-utils \
      chromium \
      nss \
      freetype \
      harfbuzz \
      ca-certificates \
      ttf-freefont
ENV CHROMIUM_PATH=/usr/bin/chromium-browser
# playwright-core must not try to download its own browser at install time.
ENV PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1
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

# Serve immediately; do not migrate here.
#
# Migrating in the CMD put a Prisma CLI resolution, a database connection, an
# advisory lock and a _prisma_migrations read in front of every cold start,
# before the server could bind its port. It also let several instances race the
# same migration on a scale-up.
#
# Cloud Run runs migrations once per deploy as a Cloud Run Job, before the new
# revision rolls out (.github/workflows/deploy.yml). docker-compose keeps the
# old migrate-then-serve behaviour by overriding this command, so a
# self-hosted stack still comes up against an empty database unattended.
CMD ["node", "dist/src/main.js"]
