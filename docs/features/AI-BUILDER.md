# AI Builder

## Overview
The AI builder generates formio.js JSON schemas from natural language prompts using configurable LLM providers.

## Modes
1. **Prompt → Form** — describe what you want, get a form schema
2. **Refine** — conversational iteration on a form's latest draft schema
3. **PDF → Form** — upload a clinical form PDF, AI extracts the structure and creates a draft form

## Provider Support
| Provider | Config Env Var | JSON Mode |
|----------|---------------|-----------|
| Claude (Anthropic) | AI_CLAUDE_API_KEY | Yes |
| OpenAI / GPT | AI_OPENAI_API_KEY | Yes |
| MiniMax | AI_MINIMAX_API_KEY | Varies |
| Kimi (Moonshot) | AI_KIMI_API_KEY | Varies |
| Ollama (local) | AI_OLLAMA_BASE_URL | Varies |

## Pipeline
1. User sends prompt
2. System prompt assembled (component catalog + schema rules + few-shot examples)
3. LLM generates JSON
4. SchemaAssembler post-processes (fix JSON quirks, deduplicate keys, inject defaults)
5. SchemaValidator validates (structural checks, component types, key uniqueness)
6. Invalid schemas are rejected before client delivery
7. Validated schema is returned to the builder as a proposed change or saved as a new draft form

## Form-Scoped Agent Flow

- `POST /api/forms/from-file` accepts PDF or image files plus form metadata, generates a Form.io schema, validates it, creates a draft form version, and returns `{ form, schema, provider }`.
- `POST /api/forms/:id/ai/refine` verifies tenant access to the form, refines the live builder schema or latest saved schema, and returns a validated proposed schema for the chat UI.
- The refinement endpoint also accepts an optional image upload (`multipart/form-data`, field `image`) so users can attach a visual reference and describe corrections in chat.
- The chat UI requires the user to apply the proposed schema before the builder auto-save writes it through `PUT /api/forms/:id/schema`.
- Published versions remain immutable. Further applied edits create or update the latest draft version through the normal form service.
- PDF generation uses page-image vision when `pdftoppm` is available and the selected provider supports image input.
- Vital sign observation charts should use the custom `vitalSignsChart` component instead of generic static tables.
- PDF generation includes a visual QA repair pass that compares a source PDF page image with a backend-rendered PNG preview of the generated schema.

## Security
- LLM API keys stored in environment variables only
- Generated schemas validated before client delivery
- AI agents do not write directly to form tables; persistence goes through tenant-scoped form services
- Production deployments should audit AI operations with provider, user, tenant, form, and version metadata without storing API keys
