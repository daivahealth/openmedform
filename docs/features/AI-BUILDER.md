---
publish: true
description: "How OpenMedForm generates clinical form schemas from a prompt, PDF or image using multiple LLM providers."
---

# AI Builder

## Overview
The AI builder generates JSON Forms definitions — separated Data / UI / Print schemas — from natural-language prompts and from source documents, using configurable LLM providers.

## Modes
1. **Describe → Form** — `POST /api/forms/from-prompt`: describe the form in
   words and get a draft
2. **Convert → Form** — `POST /api/conversions`: upload a PDF, image or HTML
   mock-up and the structure is extracted from it

Both modes collect and persist the same form metadata (`category`, `formType`),
so which door the author came through is not visible in the resulting form — see
[PDF-TO-FORM](PDF-TO-FORM.md#form-metadata-is-the-same-on-both-routes).
3. **Refine** — `POST /api/forms/:id/jsonforms/refine`: iterate on a draft in
   natural language, optionally with a reference image attached

## Provider Support
| Provider | Config Env Var | JSON Mode |
|----------|---------------|-----------|
| Claude (Anthropic) | AI_CLAUDE_API_KEY | Yes |
| OpenAI / GPT | AI_OPENAI_API_KEY | Yes |
| MiniMax | AI_MINIMAX_API_KEY | Varies |
| Kimi (Moonshot) | AI_KIMI_API_KEY | Varies |
| Ollama (local) | AI_OLLAMA_BASE_URL | Varies |

## Pipeline
1. The source (prompt text, or a PDF/image/HTML mock-up) is prepared — an HTML
   upload is sanitised, and rendered first if it builds its form at runtime
2. The conversion system prompt is assembled
3. The LLM returns the Data / UI / Print schemas plus translations
4. `JsonFormsAssemblerService` extracts and normalises the four artifacts,
   repairing dangling `$ref`s and flattening warnings
5. The Data Schema is **compile-checked under Ajv 2020-12**; output truncated
   mid-object is rejected rather than saved as a partial form
6. A draft form is created in `REVIEW` status, with per-field confidence and
   warnings persisted to `conversion_warning`

### OpenAI transport and model selection

The OpenAI provider uses the **Responses API** for text and image-backed form
generation/refinement. It requests JSON-object output and sends rendered PDF
pages as high-detail image inputs. For a balanced production default, configure
`AI_OPENAI_MODEL=gpt-5.6-terra`; model selection can also be set per tenant in
**AI Settings**. GPT-5.6 Terra supports image input, structured output,
and the Responses API.

## Prompt caching

The shared system prompt (~6.5k tokens) is byte-identical on every conversion
and refine call, so it is served from the provider's prompt cache: the Claude
provider marks it with an explicit `cache_control` block (cached reads bill at
~10% of input price); OpenAI caches long identical prefixes automatically.
Cache reads are recorded per call in `ai_usage.cached_input_tokens` and shown
as the "Cached" column on `/admin/usage`, so real vs effectively-billed input
is visible.

**Rule for prompt edits:** caching keys on the byte-identical prefix. Keep the
static system prompt static — anything call-specific (source text, hints,
instructions) belongs in the user message, never interpolated into the system
prompt. A "small" dynamic value in the system prompt silently destroys the
cache for every call.

## Form-Scoped Agent Flow

- `POST /api/conversions` accepts a PDF, image or HTML mock-up, generates the separated Data/UI/Print schemas, Ajv-compile-checks the Data Schema, and creates a draft form in REVIEW status. Poll `GET /api/conversions/:id`.
- The form preview page shows **Refine with AI** as a chat panel BESIDE the
  live preview (it was a modal dialog, which blocked the very preview being
  adjusted). Sending an instruction streams
  `POST /api/forms/:id/jsonforms/refine` over SSE, updates an unpublished
  draft in place — or forks a new draft from a published version — and
  refreshes the preview next to the conversation.
- The conversation is persistent (`form_ai_message`, one row per bubble):
  every instruction and its outcome, including failures, is recorded and
  reloaded via `GET /api/forms/:id/ai/messages`.
- The assistant's reply narrates the change in the model's own words (the
  refine prompt requires a truthful `changeSummary`; a terse model falls back
  to a factual line), then states which draft version was saved and whether it
  forked, then lists the warnings THEMSELVES (up to five, then a count) —
  warnings are read in the chat, not hunted for elsewhere.
- Refinement is **diff-based by default** (issue #130): for a targeted change
  the model returns an RFC 6902 edit script rather than re-emitting the whole
  definition — a rename is ~50 output tokens instead of thousands, which is
  the difference between seconds and half a minute. The server applies the
  patch to the same document the prompt showed the model, then pushes the
  result through the assembler, so a patched definition passes exactly the
  checks a re-emitted one passes. Any patch failure (bad pointer, missing
  target, invalid result) automatically retries the same instruction once in
  full-rewrite mode — the worst case equals the old behaviour, and the user
  only ever sees a progress line. Genuine restructures go straight to full
  mode at the model's discretion. History is scoped to the
  form, so it survives the draft fork a published-form refine makes. The
  reference image itself is not stored — only the fact one was attached.
- Refinement accepts an optional image upload (`multipart/form-data`, field
  `image`) so a visual reference can accompany the instruction.
- Published versions remain immutable — refining one always forks a draft.
- PDF conversion uses page-image vision when `pdftoppm` is available and the
  selected provider supports image input.
- Observation charts map to the `vitalSignsChart` control rather than a generic
  static table.

### Structure pre-pass (PDF and image sources)

Before converting a PDF or image, a separate narrow call
([prompts/structure-probe-prompt.ts](../../apps/api/src/modules/ai-builder/prompts/structure-probe-prompt.ts))
asks the page images which repeating table structures they contain. The reply is
validated against a strict shape and becomes the same structural hints the HTML
extractor produces — see
[PDF-TO-FORM](PDF-TO-FORM.md#structure-hints-for-pdfs-and-images). It is
additive: a failed or low-confidence probe converts as before.

### Layout fidelity

The conversion prompt
([prompts/pdf-to-jsonforms-prompt.ts](../../apps/api/src/modules/ai-builder/prompts/pdf-to-jsonforms-prompt.ts))
reproduces the source's **row-based layout**, not a flat vertical stack:

- **Two-column pages** — a page split into two parallel vertical tracks (e.g. a
  left checklist track and a right SBAR narrative track) becomes one
  `HorizontalLayout` per track, not interleaved sections. Text and vision
  extraction interleaves the tracks line-by-line; the prompt instructs the model
  to ignore that. This remains the most fragile case.
- **Paired yes/no boxes** — a label followed by two mutually exclusive boxes
  (`□YES □NO`) becomes **one enum Control** rendered as a radio, never two
  checkboxes. A single standalone `□` stays a boolean.
- **Left-spine labels** — a left column of bold category labels naming the row
  of fields beside it becomes an `OmfTableLayout` of `OmfTableRow`s, so the
  labels line up as a real column.
- **Same-line groups** — fields sharing a horizontal line become one
  `HorizontalLayout`.
- **Inline blanks** — `Label: ____` sets `options.omf.screen.labelPosition:
  "left"`.
- **Scored domains, repeating logs and reassessment grids** map to the
  `scoringMatrix`, `recordTable` and `checklistMatrix` controls — see
  [PDF-TO-FORM](PDF-TO-FORM.md).

Fidelity is **structural** (rows, groupings, inline yes/no, side-by-side
fields), not pixel-exact. Exact borders, fonts and spacing are not reproduced on
screen — the renderer is a responsive data-entry engine, not a PDF layout
replicator. For paper-accurate output use the print engine, which reconstructs
A4 from the Print Schema.

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
