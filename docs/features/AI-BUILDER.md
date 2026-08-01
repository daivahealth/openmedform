# AI Builder

## Overview
The AI builder generates JSON Forms definitions — separated Data / UI / Print schemas — from natural-language prompts and from source documents, using configurable LLM providers.

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

### OpenAI transport and model selection

The OpenAI provider uses the **Responses API** for text and image-backed form
generation/refinement. It requests JSON-object output and sends rendered PDF
pages as high-detail image inputs. For a balanced production default, configure
`AI_OPENAI_MODEL=gpt-5.6-terra`; model selection can also be set per tenant in
**AI Settings**. GPT-5.6 Terra supports image input, structured output,
and the Responses API.

## Form-Scoped Agent Flow

- `POST /api/forms/from-file` accepts PDF or image files plus form metadata, generates a Form.io schema, validates it, creates a draft form version, and returns `{ form, schema, provider }`.
- `POST /api/forms/:id/ai/refine` verifies tenant access to the form, refines the live builder schema or latest saved schema, and returns a validated proposed schema for the chat UI.
- JSON Forms previews expose **Refine with AI**, which streams `POST /api/forms/:id/jsonforms/refine`. It updates an unpublished draft in place or forks a draft from a published version, then refreshes the preview with the saved definition.
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
- LLM API keys can come from three sources, resolved per tenant by `ProviderRegistry.getProvidersForTenant` (first match wins):
  1. **Tenant-configured providers** (**AI Settings**, available to authenticated tenant users): when a tenant has any configured providers, these take priority.
  2. **Global providers** (**AI Settings**, `SUPER_ADMIN` scope): the platform-wide set that applies to every tenant without its own configuration. Stored in `ai_provider_config` under a sentinel tenant id (`00000000-0000-0000-0000-000000000000`).
  3. **Org-wide env vars** (`AI_CLAUDE_API_KEY`, `AI_OPENAI_API_KEY`, etc.): fallback when no database configuration exists at all.
- The settings API (`/api/settings/ai-providers*`) is available to authenticated users and takes an explicit **`?scope=tenant|global`**. `tenant` is always the caller's own `tenantId`; `global` addresses the sentinel scope and is rejected with 403 for anyone who is not `SUPER_ADMIN`. Two labelled consoles map onto these: **AI Settings** (`/settings`, always `scope=tenant`) and **Admin → Global AI** (`/admin/ai-providers`, `scope=global`). Omitting `scope` preserves the legacy role-based default (`SUPER_ADMIN` → global) for older clients — note that under that default a `SUPER_ADMIN` could never reach their own tenant's providers, which `scope=tenant` fixes. Each mutation records the resolved scope on its audit entry.
- Keys are encrypted at rest (AES-256-GCM, via `AI_ENCRYPTION_KEY`) and decrypted only in-memory when instantiating a provider client.
- API keys are never logged; the API only ever returns a masked form (`sk-t****xxxx`) to the client.
- On create/update, `AiProviderConfigService` rejects keys that are empty (except optional for Ollama), exceed 300 characters, or contain whitespace/line breaks/non-ASCII characters — this catches paste mistakes (e.g. pasting terminal output instead of a key) before they reach the LLM SDK, where a malformed `Authorization` header would otherwise fail with an opaque 500.
- Generated schemas validated before client delivery
- AI agents do not write directly to form tables; persistence goes through tenant-scoped form services
- Production deployments should audit AI operations with provider, user, tenant, form, and version metadata without storing API keys in audit logs

## Free-Tier Form Quota

Every user starts with `DEFAULT_FORM_LIMIT` (5) forms they may create — this bounds
platform-funded AI spend, not form usage itself, so **it never blocks form
building**: it is enforced only on creation (`FormService.assertFormLimit`,
403 with a contact-admin message once exceeded), never on editing, viewing,
publishing, or submitting existing forms.

- **Single source of truth**: `FormService.getFormQuota(userId)` computes
  `{ used, limit, remaining, unlimited, reason }` and is used both to enforce
  the limit and to answer `GET /api/me/workspace-status` (the dashboard's
  AI-setup notice) — the two can never disagree.
- **`SUPER_ADMIN` is exempt** (`reason: 'super-admin'`).
- **An admin can raise an individual user's limit** via
  `PATCH /api/admin/users/:userId/form-limit` (`/admin/limits`,
  `reason: 'admin-raised'`; `null` resets to the default).
- **Configuring the tenant's own AI provider waives the limit entirely**
  (`reason: 'own-ai-provider'`) — once a tenant pays for its own AI usage
  (Settings → AI Providers has at least one active row), the free-tier cap no
  longer applies. This is checked with `AiProviderConfigService.hasOwnActiveProvider(tenantId)`
  against the tenant's **own** id only — **never** the resolved
  tenant→global→env provider set from `ProviderRegistry`, or a configured
  global fallback would silently make every tenant unlimited and defeat the
  free tier for the whole platform. `ProviderRegistry.getEffectiveSource(tenantId)`
  answers the *separate* "which tier is actually serving my AI calls right
  now" question (`tenant`/`global`/`env`/`none`) for display only.
- The dashboard's `<AiSetupNotice>` reads `workspace-status` and is hidden for
  `super-admin`/`own-ai-provider`; otherwise it nudges toward configuring an
  AI provider, with copy escalating from informational (quota remaining) to a
  warning (`ai.effectiveSource === 'none'` — AI-assisted building genuinely
  unavailable — or the limit is reached). Dismissal is session-only by design:
  a persisted "never show again" flag could hide a real "no AI configured at
  all" state indefinitely.
