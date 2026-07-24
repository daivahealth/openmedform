# Authentication and RBAC

## Authentication
- Stateless JWT auth. Token issued on login, carried in `Authorization: Bearer <token>` header.
- JWT payload: `{ sub: userId, tenantId, email, role, iat, exp }`
- Token expiry: 24 hours (configurable via `JWT_EXPIRY` env var)
- Password hashing: bcrypt (cost factor 10)

## Roles
| Role | Permissions |
|------|------------|
| SUPER_ADMIN | All operations across all tenants |
| TENANT_ADMIN | Manage users, forms, submissions within tenant |
| FORM_DESIGNER | Create/edit/publish forms, view submissions |
| CLINICIAN | Fill forms, view own submissions |
| VIEWER | Read-only access to forms and submissions |

## Audit Logging
A central `AuditService` writes to the `audit_log` table (this closed issue #1 —
previously the table existed but nothing wrote to it). Auditing is best-effort:
a logging failure is logged and swallowed so it can never roll back the audited
clinical operation, and is recorded after the primary write commits.

**Currently wired:**
- Forms: `form.create`, `form.publish`, `form.delete`
- Submissions: `submission.complete`, `submission.sign`

Each entry captures tenant, user, action, resource type/id, IP address, and a
JSON `details` payload (e.g. version, engine, content hash, risk level).

**Planned (not yet wired):** authentication (login/logout/failed), form schema
edit/archive/clone, AI Builder generate/refine/PDF upload, admin actions.

## Published-Version Immutability
Published `form_version` rows are immutable. On publish, a SHA-256 `content_hash`
of the canonical payload (formio `schema`, or jsonforms data/ui/print schemas +
translations) is stored. Edits after publish fork a new draft version rather than
mutating the published one, and `GET /forms/:id/versions/:versionId/integrity`
recomputes the hash to detect out-of-band tampering. Every submission stays
pinned to the exact `form_version_id` (and engine) it was captured against.

## Server-Side Validation
jsonforms submissions are re-validated server-side with Ajv (Draft 2020-12)
against the published data schema on `complete` — client validity is advisory and
never trusted (Form Engine Rules). Scores are likewise recalculated server-side.

## LLM API Key Security
- Keys stored in environment variables only
- Never logged, never returned in API responses
- Provider name and model logged in audit, never the key
