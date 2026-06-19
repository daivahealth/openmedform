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
| status | ENUM | DRAFT, PUBLISHED, ARCHIVED |
| current_version_id | UUID FK | → form_version (nullable) |
| created_by_id | UUID FK | → user |

### form_version
Immutable once published. Each edit creates a new version.

| Column | Type | Notes |
|--------|------|-------|
| id | UUID PK | |
| form_id | UUID FK | → form |
| version | INT | Auto-increment per form |
| schema | JSONB | Full formio.js JSON schema |
| scoring_rules | JSONB | Extracted scoring config |
| metadata | JSONB | Display settings, theme overrides |
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
| status | ENUM | IN_PROGRESS, COMPLETED, AMENDED, VOIDED |
| data | JSONB | Submission data |
| scores | JSONB | Server-calculated scores |
| risk_level | VARCHAR(50) | Denormalized for queries |
| patient_mrn | VARCHAR(50) | Optional patient link |
| encounter_id | VARCHAR(100) | Optional encounter link |
| signed_at | TIMESTAMP | |
| signed_by | VARCHAR(255) | |

### audit_log
| Column | Type | Notes |
|--------|------|-------|
| id | BIGSERIAL PK | |
| tenant_id | UUID | |
| user_id | UUID | |
| action | VARCHAR(100) | e.g. "form.published", "ai.generated" |
| resource_type | VARCHAR(50) | |
| resource_id | UUID | |
| details | JSONB | |
| ip_address | VARCHAR(45) | |
| created_at | TIMESTAMP | |
