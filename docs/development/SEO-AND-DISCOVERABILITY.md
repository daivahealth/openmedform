---
publish: false
---

# SEO and Discoverability

How the public marketing surface of the web app describes itself to search
engines and to the LLM crawlers that answer questions like "which open-source
clinical form builder should I use".

This covers `apps/web` only. Authenticated application routes are deliberately
excluded from every indexing surface described here.

## Scope

| Surface | Indexed | Notes |
|---------|---------|-------|
| `/` | Yes | Landing page, canonical, full metadata, JSON-LD |
| `/login`, `/signup` | Yes | Own titles and canonicals |
| `/docs`, `/docs/**` | Yes | Generated from `docs/`; only files with `publish: true` |
| `/dashboard`, `/forms`, `/submissions`, `/settings`, `/admin`, `/fill`, `/auth` | No | `noindex, nofollow, nocache` plus a `robots.txt` disallow |

## Where things live

| Concern | File |
|---------|------|
| Site identity, keywords, route lists, FAQ copy | [`apps/web/src/lib/site.ts`](../../apps/web/src/lib/site.ts) |
| Global metadata, Open Graph, Twitter card, robots directives | [`apps/web/src/app/layout.tsx`](../../apps/web/src/app/layout.tsx) |
| `robots.txt` | [`apps/web/src/app/robots.ts`](../../apps/web/src/app/robots.ts) |
| `sitemap.xml` | [`apps/web/src/app/sitemap.ts`](../../apps/web/src/app/sitemap.ts) |
| Social preview image (generated) | [`apps/web/src/app/opengraph-image.tsx`](../../apps/web/src/app/opengraph-image.tsx) |
| Schema.org JSON-LD (landing page) | [`apps/web/src/components/marketing/structured-data.tsx`](../../apps/web/src/components/marketing/structured-data.tsx) |
| Docs discovery, routing and the publish gate | [`apps/web/src/lib/docs/registry.ts`](../../apps/web/src/lib/docs/registry.ts) |
| Markdown rendering and link rewriting | [`apps/web/src/lib/docs/render.ts`](../../apps/web/src/lib/docs/render.ts) |
| Docs routes | [`apps/web/src/app/docs/`](../../apps/web/src/app/docs) |

`site.ts` is the single source of truth. Copy that appears in more than one
place — the tagline, the description, the FAQ — is defined there once and
imported, so the visible page and the machine-readable metadata cannot drift.

## Rules

- **Never add a route to `publicRoutes` unless it is genuinely public.** The
  sitemap is generated from that list, and a sitemap entry a crawler cannot
  fetch is a crawl error rather than a ranking signal.
- **New authenticated route groups must be added to `privateRoutes`.** That
  list drives the `robots.txt` disallow rules.
- **Structured data must match visible content.** The `FAQPage` JSON-LD is
  generated from the same `faq` array the landing page renders. Adding a
  question to the schema without rendering it on the page violates search
  engine structured-data policy and risks a manual action.
- **A page is either indexable with a canonical, or `noindex` with none.**
  Emitting both a `noindex` directive and a canonical pointing elsewhere sends
  contradictory signals; the authenticated layout sets `canonical: null` for
  this reason.
- **Do not block AI crawlers.** `robots.ts` lists them with an explicit `Allow`.
  Several vendors treat an explicit allow as permission to use the content in
  generated answers, and being cited in those answers is the goal.
- **Route pages are client components and cannot export `metadata`.** Put the
  export in the route's server `layout.tsx` instead. This is why
  `(auth)/login/layout.tsx` and `(auth)/signup/layout.tsx` exist, and why the
  authenticated chrome lives in `components/layout/app-shell.tsx` rather than
  directly in `(main)/layout.tsx`.

## The published docs site

`/docs` renders a curated subset of this directory as HTML. The markdown stays
canonical: the site is a read-only projection of it, generated at build time,
so there is no second copy to keep in sync and no runtime filesystem access in
the container.

**The publish gate.** Every doc carries `publish:` in its frontmatter and the
default is `false`. A file is public only if it says `publish: true`. This is
deliberately opt-in: the failure mode of opt-out — a new internal runbook
silently appearing on the public internet — is much worse than the failure mode
of opt-in, which is a doc nobody can read yet.

Withheld today: `docs/deployment/` (three runbooks), `docs/development/`
(including this file), `docs/CONTRIBUTING.md`, `docs/README.md` and
`docs/ADR/TEMPLATE.md`.

Note what the gate is and is not. The repository is public, so every one of
these files is already readable on GitHub — withholding one is not a secrecy
measure and must never be relied on as one. What it controls is what appears on
the ranked domain: operational runbooks have no search value, dilute the
crawlable surface, and put things like the local seed credentials in
`DEVELOPER-ONBOARDING.md` onto an indexed page rather than a repository file.
Genuine secrets belong in neither place.

**Routing.** `docs/features/PDF-TO-FORM.md` becomes `/docs/features/pdf-to-form`.
A `README.md` becomes its directory's index, so `docs/api/README.md` is
`/docs/api` rather than `/docs/api/readme`.

**Link rewriting.** Docs are written to be read on disk and on GitHub, so their
links are filesystem-relative. At build time:

- a link to another doc becomes that doc's route, preserving any `#anchor`
- a link to a repository file becomes a GitHub blob URL
- an external link is left alone but marked `noopener noreferrer`

A published doc linking to a withheld one **fails the build**, naming both
files. That check is the reason the publish gate is safe to rely on: it makes
the two halves — what is published and what is linked — impossible to drift
apart silently.

**Markdown pipeline.** `remark-parse` → `remark-gfm` → `remark-rehype` →
`rehype-slug` → `rehype-autolink-headings` → Shiki → link rewriting →
`rehype-stringify`. Heading IDs are GitHub-compatible, so `#anchor` links
written for GitHub keep working on the site.

Note that `unified`'s `use(plugin, options)` overload cannot resolve
`rehype-autolink-headings`' options type; `render.ts` supplies its transformer
directly instead, which keeps the options type-checked. That workaround is
commented in place — do not "simplify" it back.

**Adding a doc to the site.** Set `publish: true`, add a `description:` (it
becomes the meta description and the index card subtitle), make sure the file
has an H1, and rebuild. The sidebar, the index page and the sitemap all pick it
up automatically — there is no list to update.

## Configuration

`NEXT_PUBLIC_SITE_URL` is the externally reachable origin of the web app. It is
baked in at build time (it appears in canonical URLs, `robots.txt` and
`sitemap.xml`), so it is a Docker build argument, not a runtime variable.

It defaults to `https://openmedform.daiva.health`. Override it only for preview
and staging deployments, where absolute URLs must point at that deployment. In
CI it comes from the `SITE_URL` repository variable; if that variable is unset
the build falls back to the production default.

Plumbed through: [`.env.example`](../../.env.example),
[`apps/web/Dockerfile`](../../apps/web/Dockerfile),
[`docker-compose.yml`](../../docker-compose.yml), and
[`.github/workflows/deploy.yml`](../../.github/workflows/deploy.yml).

## Verifying a change

After changing anything in the table above, build and serve the production
output — these routes are generated at build time and do not appear in `next dev`
the same way:

```bash
pnpm --filter @openmedform/web run build && pnpm --filter @openmedform/web run start
```

Then check:

```bash
curl -s localhost:3000/robots.txt
curl -s localhost:3000/sitemap.xml
curl -s localhost:3000/ | grep -oE '<title>[^<]*|<link rel="canonical"[^>]*'
curl -s localhost:3000/dashboard | grep -oE '<meta name="robots"[^>]*'

# A withheld doc must 404; a published one must not.
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/docs/deployment/gcp-cloud-run
curl -s -o /dev/null -w '%{http_code}\n' localhost:3000/docs/features/pdf-to-form
```

Because the docs are read from disk during `next build`, `docs/` must be
present in the Docker build context. It is deliberately **not** listed in
[`.dockerignore`](../../.dockerignore) and is copied in by the web
[`Dockerfile`](../../apps/web/Dockerfile). Removing either breaks the container
build while leaving local builds working, so verify container builds after
touching them.

Validate the JSON-LD with Google's Rich Results Test and the Schema.org
validator before relying on it.

## Measuring

There is no console for AI answer engines, so the two halves are measured
differently.

**Search.** Google Search Console and Bing Webmaster Tools are the only sources
of truth for impressions, average position and query coverage. Bing matters
disproportionately because several assistants ground their answers in its index.
Neither backfills data, so both should be verified as early as possible.

**AI answer engines.** Measured by asking. Keep a fixed set of buying-intent
prompts ("open source clinical form builder", "FHIR form builder with an Angular
renderer", "AI form generation SNOMED CT"), run them across the major
assistants on a regular cadence, and record whether OpenMedForm is mentioned,
cited with a link, and described correctly.

The leading indicator is crawl traffic: count requests by user agent in the
Cloud Run logs for `GPTBot`, `OAI-SearchBot`, `ChatGPT-User`, `ClaudeBot`,
`Claude-User`, `PerplexityBot` and `Google-Extended`. Mentions follow crawls.

## Known gaps

The technical foundation above makes the site *describable*. It does not by
itself make it *citable* — assistants cite extractable reference content and
third-party corroboration far more than marketing copy. Outstanding:

- No comparison content against the incumbents that already rank for these
  queries.
- No `llms.txt`.
- Off-site presence (GitHub README, npm package descriptions for the
  `@openmedform/*` renderers, open-source directories) is thin.
