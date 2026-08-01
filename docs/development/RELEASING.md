# Versioning & Releasing

The publishable packages are versioned and released with [Changesets](https://github.com/changesets/changesets)
and GitHub Actions.

## Publishable set

Four first-party packages are published to npm under the `@openmedform` org. They are a **fixed group**
in `.changeset/config.json` — they always bump and publish together at the same version:

- `@openmedform/form-schema-types`
- `@openmedform/form-core`
- `@openmedform/form-design-tokens`
- `@openmedform/react-form-renderer`

Every other workspace package is `private: true`, so **`changeset publish` never publishes them**.
Private packages that depend on the four (the apps, `form-print-engine`, `angular-form-renderer`)
are listed in the `ignore` array in `.changeset/config.json`, so the "Version Packages" PR touches
**only the four publishable packages** — no private-app version churn. (Angular packaging is tracked
in issue #4; add `@openmedform/angular-form-renderer` to the publishable set and remove it from
`ignore` when it's ready.)

## Day-to-day: add a changeset

In any PR that changes a publishable package:

```bash
pnpm changeset
```

Choose the bump type (`patch` / `minor` / `major`) and write a one-line summary. Commit the generated
file under `.changeset/`. PRs that touch these packages should include a changeset.

## Release flow (automated)

1. Merge PRs (with changesets) into `main`.
2. The **Release** workflow (`.github/workflows/release.yml`) runs and opens a **"Version Packages"**
   PR that applies the pending changesets: bumps the version, updates each `CHANGELOG.md`, and rewrites
   internal dependency ranges.
3. Review and merge that PR. The workflow runs again and **publishes** the bumped packages to npm
   (`pnpm release` → build the four packages → `changeset publish`).

Nothing is published until the "Version Packages" PR is merged.

## CI

`.github/workflows/ci.yml` runs on every PR and on pushes to `main`:

- `pnpm install --frozen-lockfile`
- `pnpm build:packages` (scoped to the publishable packages — apps and demos are not
  in the release set and are not built here)
- `pnpm test`

## One-time repository setup

1. **`NPM_TOKEN` secret** — create an npm **automation** token with publish rights to the
   `@openmedform` org (npmjs.com → Access Tokens → Generate → Automation). Add it as a repository
   secret named `NPM_TOKEN` (Settings → Secrets and variables → Actions).
2. **Allow Actions to open PRs** — Settings → Actions → General → "Allow GitHub Actions to create and
   approve pull requests" (required for the "Version Packages" PR).

## Manual release (fallback)

From a clean `main` with the version already bumped:

```bash
npm login                    # account in the @openmedform org
pnpm release                 # builds the four packages, then `changeset publish`
```

## Notes / follow-ups

- **Lint** is not yet wired into CI (per-package ESLint config is incomplete); add it once configured.
- Bump the initial version to `1.0.0` when you're ready for a stable public release (they start at
  `0.1.0`).
