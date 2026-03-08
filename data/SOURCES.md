# Model Data Sources

Reference for refreshing `upgrades.json`. Query these daily for new/deprecated models.

## Live API Endpoints

| Source | URL | Notes |
|--------|-----|-------|
| OpenRouter models | `GET https://openrouter.ai/api/v1/models` | Best single source — aggregates all providers. Returns JSON with `id`, `pricing`, `context_length`. No auth needed. |
| OpenAI models | `GET https://api.openai.com/v1/models` | Requires API key. Returns all available model IDs. |
| DeepSeek models | `GET https://api.deepseek.com/models` | Requires API key. |
| Mistral models | `GET https://api.mistral.ai/v1/models` | Requires API key. |
| Anthropic models | `GET https://api.anthropic.com/v1/models` | Requires API key (`x-api-key` header). |
| Google models | `GET https://generativelanguage.googleapis.com/v1beta/models?key=$KEY` | Requires API key (query param). |
| xAI models | `GET https://api.x.ai/v1/models` | Requires API key. |
| Together AI models | `GET https://api.together.xyz/v1/models` | Requires API key. |
| Groq models | `GET https://api.groq.com/openai/v1/models` | Requires API key. |

## Documentation Pages

| Provider | Models page | Deprecations page |
|----------|------------|-------------------|
| OpenAI | https://platform.openai.com/docs/models | https://platform.openai.com/docs/deprecations |
| Anthropic | https://docs.anthropic.com/en/docs/about-claude/models | https://docs.anthropic.com/en/docs/resources/model-deprecations |
| Google Gemini | https://ai.google.dev/gemini-api/docs/models | https://ai.google.dev/gemini-api/docs/deprecations |
| Google Vertex AI | https://cloud.google.com/vertex-ai/generative-ai/docs/learn/models | (same as above) |
| Mistral | https://docs.mistral.ai/getting-started/models | (inline on models page) |
| DeepSeek | https://api-docs.deepseek.com/quick_start/pricing | https://api-docs.deepseek.com/news |
| xAI / Grok | https://docs.x.ai/developers/models | (inline on models page) |
| AWS Bedrock | https://docs.aws.amazon.com/bedrock/latest/userguide/models-supported.html | (inline) |
| Groq | https://console.groq.com/docs/models | (inline) |
| Together AI | https://docs.together.ai/docs/serverless-models | (inline) |

## Prefixed Variant Conventions

| Platform | Format | Example |
|----------|--------|---------|
| Native | `model-id` | `gpt-4o` |
| OpenRouter | `provider/model-id` | `openai/gpt-4o` |
| AWS Bedrock | `provider.model-id-vN:M` | `anthropic.claude-3-opus-20240229-v1:0` |
| Azure OpenAI | deployment name (user-defined) | `gpt-4o` (same as native) |
| LiteLLM | `provider/model-id` | `bedrock/anthropic.claude-3-opus-20240229-v1:0` |
| Groq | custom aliases | `llama-3.3-70b-versatile` |
| Together AI | `org/Model-Name-Variant` | `meta-llama/Llama-3.3-70B-Instruct-Turbo` |

## Automated Discovery

The `discover-models` workflow runs weekly (Monday 9am UTC) and on-demand via `workflow_dispatch`.
It queries 9 provider APIs, diffs against `upgrades.json`, and opens a PR with proposed upgrades.

Run locally: `pnpm discover` (reads API keys from `.env`)
Validate: `pnpm validate` (checks upgrades.json consistency)

## Data Collected: 2026-03-07

Sources queried:
- OpenRouter API, OpenAI API, Anthropic API, Google API, Mistral API
- DeepSeek API, xAI API, Together AI API, Groq API
- AWS Bedrock supported models (manual)
