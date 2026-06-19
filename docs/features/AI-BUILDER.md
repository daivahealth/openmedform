# AI Builder

## Overview
The AI builder generates formio.js JSON schemas from natural language prompts using configurable LLM providers.

## Modes
1. **Prompt → Form** — describe what you want, get a form schema
2. **Refine** — conversational iteration on an existing schema
3. **PDF → Form** — upload a clinical form PDF, AI extracts the structure

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
6. Validated schema returned to client → loads into builder

## Security
- LLM API keys stored in environment variables only
- All generation requests audit-logged with provider, model, and token usage
- Generated schemas validated before client delivery
