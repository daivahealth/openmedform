---
publish: true
description: "The OpenMedForm data model — tenants, forms, versions, submissions and their relationships."
---

# Data Model

## Entity Relationship

```
Tenant 1──N User
Tenant 1──N Form
Tenant 1──N Submission

User 1──N Form (createdBy)
User 1──N Submission (submittedBy)

Form 1──N FormVersion
Form 1──1 FormVersion (currentVersion)
Form 1──N Submission

FormVersion 1──N Submission
```

## Tables

### tenant
Multi-tenant isolation root.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| name | VARCHAR(255) | |
| slug | VARCHAR(100) | Unique |
| is_active | BOOLEAN | Default true |
| settings | JSONB | Tenant-level config |
| created_at | TIMESTAMP | |
| updated_at | TIMESTAMP | |

### user
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | → tenant |
| email | VARCHAR(255) | Unique per tenant |
| password_hash | TEXT | bcrypt |
| full_name | VARCHAR(255) | |
| role | ENUM | SUPER_ADMIN, TENANT_ADMIN, FORM_DESIGNER, CLINICIAN, VIEWER |
| is_active | BOOLEAN | |
| last_login_at | TIMESTAMP | |

### form
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | → tenant |
| name | VARCHAR(255) | |
| slug | VARCHAR(255) | Unique per tenant |
| description | TEXT | |
| category | VARCHAR(100) | e.g. "vte-assessment" |
| tags | TEXT[] | |
| form_type | ENUM | PATIENT, NON_PATIENT (default PATIENT) |
| archived_at | TIMESTAMP? | When the form was archived. Hidden from the default list; the clock a retention policy would run off |
| status_before_archive | form_status_enum? | Status to restore on unarchive. Recorded rather than derived — a form archived awaiting review must return to REVIEW |
| status | ENUM | DRAFT, CONVERTING, REVIEW, PUBLISHED, ARCHIVED, RETIRED |
| current_version_id | UUID FK | → form_version (nullable) |
| created_by_id | UUID FK | → user |

### form_version
Immutable once published (enforced: on publish a SHA-256 `content_hash` of the
canonical payload is stored; edits after publish fork a new draft, and
`GET /forms/:id/versions/:versionId/integrity` recomputes the hash to detect
tampering). Each edit creates a new version. JSON Forms only — see [ADR-004](../ADR/004-remove-formio-engine.md).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| form_id | UUID FK | → form |
| version | INT | Auto-increment per form |
| data_schema | JSONB | JSON Schema 2020-12 (nullable) |
| ui_schema | JSONB | UI/layout schema (nullable) |
| print_schema | JSONB | A4 print schema (nullable) |
| translations | JSONB | Translation bundle (nullable) |
| scoring_rules | JSONB | Scoring config used by the server-side engine |
| metadata | JSONB | Display settings, theme overrides |
| conversion_metadata | JSONB | Per-field confidence/warnings from AI conversion. Also carries `structureProbe` — written by the server, not the model — recording what a PDF/image page-structure pre-pass detected and rejected, so a reviewer can see what the pipeline actually passed to the model |
| content_hash | VARCHAR(64) | SHA-256 of canonical published payload (immutability) |
| changelog | TEXT | |
| published_at | TIMESTAMP | NULL = draft |

### submission
| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID FK | → tenant |
| form_id | UUID FK | → form |
| form_version_id | UUID FK | → form_version |
| submitted_by_id | UUID FK | → user |
| status | ENUM | IN_PROGRESS, COMPLETED, SIGNED, AMENDED, VOIDED |
| data | JSONB | Submission data (jsonforms: Ajv-validated server-side on complete) |
| scores | JSONB | Server-calculated scores |
| risk_level | VARCHAR(50) | Denormalized for queries |
| patient_mrn | VARCHAR(50) | Optional patient link |
| encounter_id | VARCHAR(100) | Optional encounter link |
| patient_context | JSONB | Full patient context for patient forms |
| signed_at | TIMESTAMP | |
| signed_by | VARCHAR(255) | |

### form_asset
Binary assets referenced by a form version (logos, reference images). Log-style
scalar FKs (no relations), matching `audit_log`.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| tenant_id | UUID | |
| form_version_id | UUID | nullable |
| filename | VARCHAR(255) | |
| mime_type | VARCHAR(100) | |
| size_bytes | INT | |
| checksum | VARCHAR(64) | |
| storage_key | VARCHAR(500) | external store key (nullable) |
| data | BYTEA | inline bytes (nullable) |
| created_at | TIMESTAMP | |

### conversion_job / conversion_warning
Async PDF→form conversion tracking (consumed in Phase 6). Persisted warnings
ensure uncertain elements are never silently dropped.

`conversion_job`: id, tenant_id, form_id?, status ENUM (PENDING, RUNNING, REVIEW,
COMPLETED, FAILED), provider, model,
source_file_name, page_count, similarity_score, error, created_by_id, created_at,
completed_at. `conversion_warning`: id, conversion_job_id FK, type, message,
binding?, source_page?, confidence?, created_at.

### form_ai_message
The refine conversation for a form — one row per chat bubble in the preview
page's Refine-with-AI panel. `role` USER carries the instruction; `role`
ASSISTANT the outcome, with `status` ERROR when the refinement failed (an
instruction that did not apply is part of the story). Scoped to the form, not a
version, so history survives the draft fork a published-form refine makes.
Log-style scalar FKs like `audit_log`; writes are best-effort and never fail
the refinement. Columns: id, tenant_id, form_id, role, content, status,
had_image (the image itself is not stored), created_by_id?, created_at.
Bounded read: the panel loads the newest 400 rows.

(Successor to the Form.io builder's table of the same name, dropped in
migration 20260801190000 with the engine — see ADR-004.)

### audit_log
Now actively written (closes issue #1) by `AuditService` on form create/publish/
delete, submission complete/sign, and authentication (`auth.register`,
`auth.login`, `auth.login.failed`). Best-effort: a logging failure is logged and
swallowed so it can never roll back the audited clinical operation.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| tenant_id | UUID | |
| user_id | UUID | |
| action | VARCHAR(100) | e.g. "form.publish", "submission.sign", "auth.login" |
| resource_type | VARCHAR(50) | |
| resource_id | UUID | |
| details | JSONB | |
| ip_address | VARCHAR(45) | |
| created_at | TIMESTAMP | |

### ai_usage
One row per LLM call (generate / refine / convert), written best-effort by
`AiUsageService` via a metering wrapper around every provider. Aggregated by the
SUPER_ADMIN analytics console (`GET /api/admin/stats`) and the usage console
(`GET /api/admin/usage`, grouped by user / form / tenant / provider /
operation; the operation view adds output-token p50/p95 per call).
`cached_input_tokens` records how much of the input the provider served from
its prompt cache (issue #129) — a subset of `input_tokens`, billed at a deep
discount, zero for providers that report no caching.
Operational metering — not tenant-query-scoped for domain reads, but carries
`tenant_id`/`user_id`/`form_id` for attribution.

**Form attribution.** `form_id` is nullable and has no FK (log-style, like
`audit_log`), because: refine/designer flows know the form up front and set it
directly; *create* flows meter the LLM call **before** the form exists and
backfill via `AiUsageService.attachFormId` once it does; a run that never
produces a form (e.g. a failed conversion) correctly stays unattributed; and
usage history must outlive the form being deleted. The usage console reports
unattributed rows as "Unattributed" rather than dropping them, so grouped rows
always reconcile with the platform total.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| tenant_id | UUID | |
| user_id | UUID (nullable) | |
| form_id | UUID (nullable) | attributed form; no FK — see above |
| provider | VARCHAR(50) | e.g. "claude", "openai" |
| model | VARCHAR(100) | model that reported the usage |
| operation | VARCHAR(50) | e.g. "ai.generate", "ai.refine", "conversion.jsonforms" |
| input_tokens | INT | |
| output_tokens | INT | |
| total_tokens | INT | |
| created_at | TIMESTAMP | |

## auth_exchange_code

One-time codes that trade for an access token after Google SSO, so the JWT never
travels in a redirect URL. See
[security/AUTH-AND-RBAC](../security/AUTH-AND-RBAC.md#sso-redirect-does-not-carry-the-token).

| Column | Type | Notes |
|---|---|---|
| id | UUID | |
| code_hash | VARCHAR(64) | SHA-256 of the code, unique. The plaintext exists only in the redirect URL |
| user_id | UUID | Log-style scalar, no FK |
| expires_at | TIMESTAMP | 60s after minting |
| used_at | TIMESTAMP? | Set on first use; the `usedAt IS NULL` filter makes the claim atomic |
| created_at | TIMESTAMP | |

A table rather than in-process state because the redirect and the exchange are
two requests that can be served by different instances. Swept opportunistically
when new codes are minted.
