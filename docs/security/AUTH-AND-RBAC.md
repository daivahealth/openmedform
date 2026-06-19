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
All user actions are logged to the `audit_log` table:
- Authentication: login, logout, failed login
- Forms: create, edit schema, publish, archive, clone
- Submissions: start, update, complete, sign
- AI Builder: generate, refine, PDF upload
- Admin: user create, role change, tenant settings

## LLM API Key Security
- Keys stored in environment variables only
- Never logged, never returned in API responses
- Provider name and model logged in audit, never the key
