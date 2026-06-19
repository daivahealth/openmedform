# Contributing to OpenMedForm Documentation

## Standards

- Keep docs concise and scannable. Use tables and bullet points over paragraphs.
- Each doc should have a clear single responsibility. Don't duplicate content across docs.
- Use relative links between docs. Keep the navigation in `docs/README.md` up to date.
- Code examples should be runnable and tested. Don't include pseudocode without marking it.

## Where to Put Things

| Change Type | Destination |
|-------------|-------------|
| System design, data model | `docs/architecture/` |
| Architecture decisions | `docs/ADR/` (use ADR template) |
| API endpoints, DTOs | `docs/api/` |
| Feature behavior, workflows | `docs/features/` |
| Dev setup, commands | `docs/development/` |
| Docker, deployment | `docs/deployment/` |
| Auth, security, audit | `docs/security/` |

## ADR Template

Use `docs/ADR/TEMPLATE.md` for new architecture decision records. Name files as `NNN-short-title.md`.
