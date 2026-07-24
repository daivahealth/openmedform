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

### Layout fidelity (PDF → Form)

The PDF/image generation prompt ([prompts/pdf-to-form-prompt.ts](../../apps/api/src/modules/ai-builder/prompts/pdf-to-form-prompt.ts)) reproduces the paper form's **row-based layout**, not just a flat vertical stack of fields:

- **Page-level two-column layouts** — when the whole page is split into two independent vertical tracks running in parallel (e.g. a left track of checklists and a right track of SBAR narrative), the generator reconstructs it as one top-level `columns` (width 6/6): all left-track blocks in the left column, all right-track blocks in the right. Text/vision extraction interleaves the two tracks line-by-line; the generator is instructed to ignore that interleaving rather than scatter one track's sections through the other. SBAR sections (Situation/Background/Assessment/Recommendation) are kept together in order in the right column. This is the most fragile case — reliability varies with how cleanly the source PDF separates its columns.
- **Paired yes/no boxes** — a label followed by two mutually-exclusive boxes (`□YES □NO`, `□ΝΑΙ □ΟΧΙ`) becomes **one `radio` with `inline: true`** and two values, never two separate checkboxes. A single standalone `□` (one risk factor / presence-absence) stays a `checkbox`.
- **Left spine labels** — many paper forms have a left column of bold category labels (e.g. `Αλλεργίες`, `Ζωτικά Σημεία`, `Εκτίμηση Δέρματος`) naming the row of fields to their right. Each labelled row becomes one `columns` component whose **first column is a narrow `htmlelement` (`strong`) holding the label text**, followed by the row's field columns. These labels must always be rendered visibly — the generator must not encode a category only in a component `key` (keys are invisible to the user).
- **Same-line field groups** — multiple fields sharing one horizontal line become a single `columns` component so they stay side-by-side.
- **Inline fill-in blanks** — `Label: ____` on one line uses `labelPosition: "left-left"` so the label sits beside the input.

Fidelity is **structural** (rows, groupings, inline yes/no, side-by-side fields), not pixel-exact. Exact borders, fonts, and spacing are not reproduced — Form.io's open-source renderer is a data-entry engine, not a PDF layout replicator. The relevant layout properties (`inline`, `labelPosition`, `table`/`columns` structures) pass through the schema assembler and validator unchanged.

## Security
- LLM API keys can come from two sources, resolved per tenant by `ProviderRegistry.getProvidersForTenant`:
  1. **Tenant-configured providers** (Settings → AI Providers): keys are encrypted at rest (AES-256-GCM, via `AI_ENCRYPTION_KEY`) and decrypted only in-memory when instantiating a provider client. When a tenant has any configured providers, these take priority over env vars.
  2. **Org-wide env vars** (`AI_CLAUDE_API_KEY`, `AI_OPENAI_API_KEY`, etc.): used as a fallback only when a tenant has no provider configured in the database.
- API keys are never logged; the API only ever returns a masked form (`sk-t****xxxx`) to the client.
- On create/update, `AiProviderConfigService` rejects keys that are empty (except optional for Ollama), exceed 300 characters, or contain whitespace/line breaks/non-ASCII characters — this catches paste mistakes (e.g. pasting terminal output instead of a key) before they reach the LLM SDK, where a malformed `Authorization` header would otherwise fail with an opaque 500.
- Generated schemas validated before client delivery
- AI agents do not write directly to form tables; persistence goes through tenant-scoped form services
- Production deployments should audit AI operations with provider, user, tenant, form, and version metadata without storing API keys in audit logs
