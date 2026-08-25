# Changesets

This folder holds [changesets](https://github.com/changesets/changesets) — one Markdown file per
pending change describing the version bump for the **publishable** packages.

## Add a changeset (do this in the PR that makes the change)

```bash
pnpm changeset
```

Pick the affected package(s), the bump type (`patch` / `minor` / `major`), and write a one-line
summary. Commit the generated file in `.changeset/`.

## How releases happen

- Four of the publishable packages are a **fixed group** — they always bump and publish together at
  the same version:
  `@openmedform/form-schema-types`, `@openmedform/form-core`,
  `@openmedform/form-design-tokens`, `@openmedform/react-form-renderer`.
- `@openmedform/angular-form-renderer` and `@openmedform/form-print-engine` are also published, but
  version **independently** — a changeset that should release either must name it explicitly.
- All other workspace packages are `private: true` and are ignored by changesets automatically.
- On push to `main`, the Release workflow opens a **"Version Packages"** PR that applies the pending
  changesets (bumps versions + updates `CHANGELOG.md`). Merging that PR publishes to npm.

See `docs/development/RELEASING.md` for the full flow and required secrets.
