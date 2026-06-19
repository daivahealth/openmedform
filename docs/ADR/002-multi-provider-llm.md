# ADR-002: Multi-Provider LLM Architecture for AI Builder

## Status
Accepted

## Context
The AI form builder needs to generate formio.js JSON schemas from natural language prompts. Different users may prefer different LLM providers (Claude, OpenAI, local models via Ollama). We need a pluggable architecture that doesn't lock us into a single provider.

## Decision
Define a `LlmProvider` interface that all providers implement. Use a `ProviderRegistry` that reads configuration from environment variables and instantiates available providers. The AI builder service routes requests through this registry.

## Consequences
- **Positive:** Users can choose their preferred LLM. Easy to add new providers. No vendor lock-in.
- **Negative:** Each provider may produce slightly different quality output. System prompt must be provider-agnostic.
- **Mitigation:** Schema validation and post-processing pipeline normalizes output regardless of provider. Few-shot examples in the system prompt improve consistency.
