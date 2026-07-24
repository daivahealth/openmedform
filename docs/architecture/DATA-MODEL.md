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
| status | ENUM | DRAFT, PUBLISHED, ARCHIVED |
| current_version_id | UUID FK | → form_version (nullable) |
| created_by_id | UUID FK | → user |

### form_version
Immutable once published (enforced: on publish a SHA-256 `content_hash` of the
canonical payload is stored; edits after publish fork a new draft, and
`GET /forms/:id/versions/:versionId/integrity` recomputes the hash to detect
tampering). Each edit creates a new version. Dual-engine — see [ADR-003](../ADR/003-dual-engine-json-forms.md).

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| form_id | UUID FK | → form |
| version | INT | Auto-increment per form |
| engine | ENUM | FORMIO \| JSONFORMS (default FORMIO) |
| schema | JSONB | formio engine: full formio.js JSON schema (nullable) |
| data_schema | JSONB | jsonforms engine: JSON Schema 2020-12 (nullable) |
| ui_schema | JSONB | jsonforms engine: UI/layout schema (nullable) |
| print_schema | JSONB | jsonforms engine: A4 print schema (nullable) |
| translations | JSONB | jsonforms engine: translation bundle (nullable) |
| scoring_rules | JSONB | Extracted scoring config (formio) |
| metadata | JSONB | Display settings, theme overrides |
| conversion_metadata | JSONB | Per-field confidence/warnings from AI conversion |
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
COMPLETED, FAILED), engine_target ENUM (FORMIO \| JSONFORMS), provider, model,
source_file_name, page_count, similarity_score, error, created_by_id, created_at,
completed_at. `conversion_warning`: id, conversion_job_id FK, type, message,
binding?, source_page?, confidence?, created_at.

### audit_log
Now actively written (closes issue #1) by `AuditService` on form create/publish/
delete and submission complete/sign. Best-effort: a logging failure is logged and
swallowed so it can never roll back the audited clinical operation.

| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| tenant_id | UUID | |
| user_id | UUID | |
| action | VARCHAR(100) | e.g. "form.publish", "submission.sign" |
| resource_type | VARCHAR(50) | |
| resource_id | UUID | |
| details | JSONB | |
| ip_address | VARCHAR(45) | |
| created_at | TIMESTAMP | |
