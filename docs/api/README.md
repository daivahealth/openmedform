# API Reference

## Base URL
`http://localhost:3100/api`

## Authentication
All endpoints except `/api/auth/register`, `/api/auth/login`, `/api/auth/google*` and `/api/public/*` require a valid JWT in the `Authorization: Bearer <token>` header.

## Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/register | **Public** self-service signup: creates a new tenant (organization) + its first `TENANT_ADMIN`, returns JWT. Body: `{ fullName, organizationName, email, password }`. Email must be globally unique. |
| POST | /api/auth/login | Login, returns JWT (audit-logged as `auth.login`) |
| GET | /api/auth/google | Start Google OAuth2 handshake (redirect) |
| GET | /api/auth/google/callback | Google OAuth2 callback, redirects to web with JWT |
| GET | /api/auth/me | Current user profile |

### Admin (SUPER_ADMIN only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/stats | Platform-wide analytics: totals, per-tenant and per-user breakdown (forms, submissions, last login, AI token usage), usage by provider, recent logins. Gated to `SUPER_ADMIN` by the global `RolesGuard`; other roles receive 403. |

### Forms
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms | List forms (paginated) |
| GET | /api/forms/count | Total form count for the tenant |
| POST | /api/forms | Create form |
| GET | /api/forms/:id | Get form with current version |
| PUT | /api/forms/:id | Update form metadata |
| DELETE | /api/forms/:id | Archive form (soft delete — sets status ARCHIVED) |
| GET | /api/forms/:id/deletion-summary | Counts of versions and submissions a permanent delete would destroy |
| DELETE | /api/forms/:id/permanent | Permanently delete the form and ALL related data (versions, submissions, AI messages) — irreversible |
| PUT | /api/forms/:id/schema | Save form schema (auto-save) |
| POST | /api/forms/from-file | Upload PDF/image, generate schema, and create draft form |
| POST | /api/forms/from-pdf | Compatibility alias for PDF/image generation |
| POST | /api/forms/:id/ai/refine | Refine a form schema with AI chat; accepts JSON or multipart image reference |
| POST | /api/forms/:id/publish | Publish current draft (stores an immutable SHA-256 `content_hash`; audit-logged) |
| GET | /api/forms/:id/versions | List versions |
| GET | /api/forms/:id/versions/:versionId/integrity | Recompute a published version's content hash to detect tampering |
| POST | /api/forms/:id/clone | Clone form |
| GET | /api/forms/:id/export | Export an OpenMedForm template bundle for re-import |
| GET | /api/forms/:id/export/formio | Download the stored native Form.io schema (`display`/`components`); available only for Form.io forms |
| POST | /api/forms/:id/jsonforms/refine | Prompt-based designer: refine a jsonforms form's Data/UI/Print schemas via natural language; accepts JSON or multipart `image` visual reference (SSE stream; edits a draft or forks one if published) |

### Submissions
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms/:formId/submissions | List submissions |
| POST | /api/forms/:formId/submissions | Start submission |
| GET | /api/submissions | List all submissions for the tenant |
| GET | /api/submissions/count | Total submission count for the tenant |
| GET | /api/submissions/:id | Get submission |
| PUT | /api/submissions/:id | Update submission (auto-save) |
| POST | /api/submissions/:id/complete | Finalize and score (jsonforms: Ajv-validated server-side; 400 on invalid; audit-logged) |
| POST | /api/submissions/:id/sign | Sign a COMPLETED submission → status SIGNED + signed_at/signed_by (audit-logged) |

### AI Builder
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ai/generate | Generate form from prompt |
| POST | /api/ai/refine | Refine supplied schema directly |
| POST | /api/ai/generate-from-pdf | Generate schema from uploaded PDF |
| GET | /api/ai/providers | List configured LLM providers |

### Conversions (engine-targeted PDF/image → form)
Async pipeline (Phase 6). `POST` creates a `conversion_job` and runs in the
background; poll `GET /api/conversions/:id` for status (PENDING → RUNNING →
REVIEW \| FAILED). On success a **draft form** (status REVIEW) is created for the
chosen engine, and for jsonforms per-field confidence + warnings are persisted.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/conversions | multipart: `file`, `engine` (formio\|jsonforms), optional `provider`, `instructions`. Returns the created job |
| POST | /api/conversions/:id/accept | Accept a reviewed job: promote the draft form REVIEW→DRAFT, mark job COMPLETED (audited) |
| GET | /api/conversions | List conversion jobs for the tenant |
| GET | /api/conversions/:id | Job status + persisted warnings |
