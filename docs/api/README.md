# API Reference


> **Rate limits.** All endpoints are throttled. Login is 10/min per IP; AI
> endpoints (`/api/conversions`, `/api/forms/from-prompt`,
> `/api/forms/:id/jsonforms/refine`) are 10/min **per user**; uploads 30/min;
> everything else 300/min. Exceeding a limit returns **429** with a
> `Retry-After` header. `GET /api/health` is exempt. See
> [security/AUTH-AND-RBAC](../security/AUTH-AND-RBAC.md#rate-limiting).

## Base URL
`http://localhost:3100/api`

## Authentication
All endpoints except `/api/auth/login`, `/api/auth/google*` and `/api/public/*` require a valid JWT in the `Authorization: Bearer <token>` header.

## Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/exchange | Trade the one-time `code` from an SSO redirect (either provider) for `{ accessToken, user }`. Single-use, 60s TTL; expired/spent/unknown all return the same 401. The redirect never carries the token itself |
| POST | /api/auth/login | Login, returns JWT (audit-logged as `auth.login`) |
| GET | /api/auth/microsoft | Start the Microsoft (Entra ID) handshake. Same `?mode=signup&org=&country=` contract as Google. 503 when unconfigured |
| GET | /api/auth/microsoft/callback | Microsoft callback; same one-time-code redirect as Google |
| GET | /api/auth/google | Start Google OAuth2 handshake (redirect). `?mode=signup&org=...&country=...` provisions a new tenant on first sign-in (org + country mandatory); default `login` is invite-only |
| GET | /api/auth/google/callback | Google OAuth2 callback, redirects to web with JWT |
| GET | /api/auth/me | Current user profile |

### Workspace
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/me/workspace-status | The caller's form-creation quota (`used`/`limit`/`remaining`/`unlimited`/`reason`) and which tier is currently serving their AI calls (`ai.effectiveSource`: `tenant`/`global`/`env`/`none`). Powers the dashboard's AI-setup notice; `contactEmail` is included for the "raise my limit" CTA. |

### Admin (SUPER_ADMIN only)
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/admin/stats | Platform-wide analytics: totals, per-tenant (incl. country) and per-user breakdown (forms, submissions, last login, AI token usage), users by country, usage by provider, recent logins. Gated to `SUPER_ADMIN` by the global `RolesGuard`; other roles receive 403. |
| GET | /api/admin/usage | Token spend grouped along one dimension: `?groupBy=user\|form\|tenant\|provider\|operation` (default `user`), optionally windowed with `?from=`/`?to=` (ISO dates; 400 on unparseable). Returns platform `totals` plus `rows` of `{ key, label, calls, inputTokens, cachedInputTokens, outputTokens, totalTokens, lastUsedAt }` (`cachedInputTokens` = input served from the provider's prompt cache) sorted by tokens desc. The `operation` dimension answers the AI-cost questions (issue #128): which pipeline dominates, and how big is a typical call — its rows additionally carry `outputP50`/`outputP95` (output tokens per call, computed over the windowed rows). Rows with no key surface as `Unattributed` so the grouped rows always reconcile with the total; a key whose entity was deleted labels as `(deleted)`. |
| PATCH | /api/admin/users/:userId/form-limit | Set a user's form creation quota (`{ formLimit: number | null }`; null resets to the default of 5). SUPER_ADMIN only |

### AI Settings
All four accept `?scope=tenant|global`. `tenant` is the caller's own organization; `global` is the platform-wide fallback and is **SUPER_ADMIN only** (403 otherwise). Omitting `scope` keeps the legacy default (SUPER_ADMIN → global, everyone else → tenant); under that default a SUPER_ADMIN cannot reach their own tenant, which `?scope=tenant` fixes.

| Method | Path | Description |
|--------|------|-------------|
| GET | /api/settings/ai-providers | List provider configurations in the requested scope |
| POST | /api/settings/ai-providers | Add a provider in the requested scope; keys are encrypted and never returned unmasked |
| PUT | /api/settings/ai-providers/:id | Update a provider only when it belongs to the requested scope |
| DELETE | /api/settings/ai-providers/:id | Delete a provider only when it belongs to the requested scope |

### Forms
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms | List forms (paginated). Archived forms are excluded unless `?includeArchived=true`; `/api/forms/count` counts the same set |
| GET | /api/forms/count | Total form count for the tenant |
| POST | /api/forms | Create form. Subject to the per-user creation quota (default 5; 403 with a contact-admin message when exceeded) — waived once the tenant has configured its own active AI provider (Settings → AI Providers), since it then pays for its own AI usage. SUPER_ADMIN is exempt. **The same quota applies to every route that creates a form**: `/api/forms/from-prompt`, `/api/forms/:id/clone`, `/api/forms/import` and `POST /api/conversions`. It is checked before any LLM call, so a user at their limit is refused without spending tokens |
| GET | /api/forms/:id | Get form with current version |
| PUT | /api/forms/:id | Update form metadata |
| POST | /api/forms/:id/unarchive | Restore an archived form to the status it had when archived (`statusBeforeArchive`, or DRAFT for forms archived before that was recorded). 400 if not archived. Audited as `form.unarchive` |
| DELETE | /api/forms/:id | Archive form (soft delete — sets status ARCHIVED) |
| GET | /api/forms/:id/deletion-summary | Counts of versions and submissions a permanent delete would destroy |
| DELETE | /api/forms/:id/permanent | Permanently delete the form and ALL related data (versions, submissions, AI messages) — irreversible |
| PUT | /api/forms/:id/schema | Save form schema (auto-save) |
| POST | /api/forms/from-file | Upload PDF/image, generate schema, and create draft form. `name` and `category` are required (400 otherwise) |
| POST | /api/forms/from-pdf | Compatibility alias for PDF/image generation (same required fields as from-file) |
| POST | /api/forms/from-prompt | JSON `{ name, prompt, category?, description?, formType?, provider? }`: AI generates the separated Data/UI/Print schemas from the prompt and creates a draft form (subject to the creation quota). `name` and `prompt` are required (400 otherwise). Returns `{ form, warnings }` |
| POST | /api/forms/:id/publish | Publish current draft (stores an immutable SHA-256 `content_hash`; audit-logged) |
| GET | /api/forms/:id/versions | List versions |
| GET | /api/forms/:id/versions/:versionId/integrity | Recompute a published version's content hash to detect tampering |
| POST | /api/forms/:id/clone | Clone form |
| GET | /api/forms/:id/export | Export an OpenMedForm template bundle for re-import |
| POST | /api/forms/:id/jsonforms/refine | Prompt-based designer: refine a jsonforms form's Data/UI/Print schemas via natural language; accepts JSON or multipart `image` visual reference (SSE stream; edits a draft or forks one if published) |
| GET | /api/terminology/loinc | Top LOINC candidates for `?q=` (name, synonym, or exact code) from the locally loaded table; also reports how many codes are loaded |
| POST | /api/forms/:id/coding/suggest | Retrieve-then-select AI pass: for every uncoded field, search the local LOINC table for candidates and let the model choose among them or decline (it can never invent a code). Writes `source: 'ai', verified: false` suggestions to the draft for dictionary approval; never overwrites existing bindings. Audited `form.coding.suggest`; metered `coding.suggest` |
| GET | /api/forms/:id/ai/messages | The form's refine conversation (chat history), oldest first — one row per instruction/outcome, failures included |

### Submissions
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms/:formId/submissions | List submissions |
| POST | /api/forms/:formId/submissions | Start submission |
| GET | /api/submissions | List records. Voided ones are excluded unless `?includeVoided=true`. `/api/submissions/count` counts the same set |
| GET | /api/submissions/count | Total record count, matching the default list (voided excluded) |
| GET | /api/submissions/:id | Get submission |
| PUT | /api/submissions/:id | Update submission (auto-save) |
| POST | /api/submissions/:id/complete | Finalize and score (jsonforms: Ajv-validated server-side; 400 on invalid; audit-logged) |
| DELETE | /api/submissions/:id | **Void** a record — how "delete" behaves for clinical data. Status becomes `VOIDED`; the row and its data are kept and drop out of the default list. Own records for any user; anyone's for `TENANT_ADMIN`/`SUPER_ADMIN` (403 otherwise). Idempotent. Audited as `submission.void` with the previous status |
| DELETE | /api/submissions/:id/permanent | **Destroy** a record. `TENANT_ADMIN`/`SUPER_ADMIN` only (403 otherwise), unrecoverable. Audited as `submission.delete` **before** the row is removed, with form, status, MRN, encounter and submitter — once it is gone that entry is the only trace |
| POST | /api/submissions/:id/sign | Sign a COMPLETED submission → status SIGNED + signed_at/signed_by (audit-logged) |

### AI Builder
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ai/generate | Generate form from prompt |
| POST | /api/ai/generate-from-pdf | Generate schema from uploaded PDF |
| GET | /api/ai/providers | List configured LLM providers |

### Conversions (engine-targeted PDF/image → form)
Async pipeline (Phase 6). `POST` creates a `conversion_job` and runs in the
background; poll `GET /api/conversions/:id` for status (PENDING → RUNNING →
REVIEW \| FAILED). On success a **draft form** (status REVIEW) is created for the
chosen engine, and for jsonforms per-field confidence + warnings are persisted.

| Method | Path | Description |
|--------|------|-------------|
| POST | /api/conversions | multipart: `file`, optional `provider`, `instructions`, `extractScriptConfig`. Returns the created job. Accepts PDF, PNG/JPEG/WebP/GIF, and **HTML** (`text/html`, max 2MB — 400 otherwise). Oversized/empty HTML mock-ups are rejected with guidance rather than half-converted. `extractScriptConfig` (`"true"`/`"1"`; anything else, including absent, is off) opts an HTML upload in to having its scripts **parsed, never executed** for literal option lists / thresholds / reference tables — see [PDF-TO-FORM](../features/PDF-TO-FORM.md#reading-config-from-scripts-opt-in). The choice is recorded in the `ai.convert` audit entry |
| POST | /api/conversions/:id/accept | Accept a reviewed job: promote the draft form REVIEW→DRAFT, mark job COMPLETED (audited) |
| GET | /api/conversions | List conversion jobs for the tenant |
| GET | /api/conversions/:id | Job status + persisted warnings. While RUNNING, `stage` (READING_SOURCE / GENERATING / VALIDATING / SAVING) and `stageDetail` (e.g. `3 pages · claude`) report live progress for the dialog's checklist; both are null once the job finishes |
