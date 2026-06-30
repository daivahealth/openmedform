# API Reference

## Base URL
`http://localhost:3100/api`

## Authentication
All endpoints except `/api/auth/login` and `/api/public/*` require a valid JWT in the `Authorization: Bearer <token>` header.

## Endpoints

### Auth
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/auth/login | Login, returns JWT |
| POST | /api/auth/register | Create user (admin only) |
| GET | /api/auth/me | Current user profile |

### Forms
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms | List forms (paginated) |
| POST | /api/forms | Create form |
| GET | /api/forms/:id | Get form with current version |
| PUT | /api/forms/:id | Update form metadata |
| DELETE | /api/forms/:id | Archive form |
| PUT | /api/forms/:id/schema | Save form schema (auto-save) |
| POST | /api/forms/from-file | Upload PDF/image, generate schema, and create draft form |
| POST | /api/forms/from-pdf | Compatibility alias for PDF/image generation |
| POST | /api/forms/:id/ai/refine | Refine a form schema with AI chat; accepts JSON or multipart image reference |
| POST | /api/forms/:id/publish | Publish current draft |
| GET | /api/forms/:id/versions | List versions |
| POST | /api/forms/:id/clone | Clone form |

### Submissions
| Method | Path | Description |
|--------|------|-------------|
| GET | /api/forms/:formId/submissions | List submissions |
| POST | /api/forms/:formId/submissions | Start submission |
| GET | /api/submissions/:id | Get submission |
| PUT | /api/submissions/:id | Update submission (auto-save) |
| POST | /api/submissions/:id/complete | Finalize and score |
| POST | /api/submissions/:id/sign | Add signature |

### AI Builder
| Method | Path | Description |
|--------|------|-------------|
| POST | /api/ai/generate | Generate form from prompt |
| POST | /api/ai/refine | Refine supplied schema directly |
| POST | /api/ai/generate-from-pdf | Generate schema from uploaded PDF |
| GET | /api/ai/providers | List configured LLM providers |
