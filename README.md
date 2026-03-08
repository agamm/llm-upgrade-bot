# llm-upgrade-bot

**Dependabot for LLM model versions.** Scans your codebase for outdated model strings and opens PRs to upgrade them.

Hardcoded `{gpt-4}`, `{claude-3-opus}`, or `{gemini-2.5-pro}`? This tool finds them and upgrades to the latest versions -- across **235+ model strings** from OpenAI, Anthropic, Google, xAI, Meta, Mistral, DeepSeek, Moonshot, Cohere, Qwen, MiniMax, and more.

```
$ llm-upgrade-bot ./src

  src/api.ts:12  "gpt-4o-2024-11-20"
    -> safe:  gpt-4o-2024-11-20
    -> major: gpt-5.4

  src/config.yaml:5  "claude-opus-4-6"
    -> major: claude-opus-4-6

  Found 2 upgradable models in 2 files
```

## Install as GitHub Action

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-LLM%20Upgrade%20Bot-blue?logo=github)](https://github.com/marketplace/actions/llm-upgrade-bot)

Create `.github/workflows/llm-upgrades.yml` in your repo:

```yaml
name: LLM Model Upgrades
on:
  schedule:
    - cron: '0 */6 * * *'  # Every 6 hours
  workflow_dispatch:

permissions:
  contents: write
  pull-requests: write

jobs:
  upgrade:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: agamm/llm-upgrade-bot@v1
```

## CLI usage

```bash
npx llm-upgrade-bot ./your-project        # scan
npx llm-upgrade-bot ./your-project --fix   # auto-fix
npx llm-upgrade-bot ./your-project --json  # machine-readable
npx llm-upgrade-bot . --extensions ".txt,.rst"  # add extra file types
```

## How it works

We continuously scan model APIs (OpenAI, Anthropic, Google, DeepSeek, Together AI, Groq, and more) every hour to detect new models and automatically update our [upgrade map](data/upgrades.json). You don't need to supply any API keys -- we take care of keeping the model data fresh.

When the action runs in your repo, it:

1. **Fetches** the latest upgrade map with 235+ model entries (always up-to-date)
2. **Scans** your files and matches model strings against it (including bare model names in `.md`/`.mdx` docs)
3. **Classifies** each match as a **safe** upgrade (same family, newer version) and/or a **major** upgrade (next-gen model)
4. **Fixes** files in-place, preferring safe upgrades
5. **Opens a PR** with a summary table of all changes

| Tier | Meaning | Example |
|------|---------|---------|
| safe | Same family, newer version | `gpt-4o-2024-05-13` -> `gpt-4o-2024-11-20` |
| major | Latest model in capability tier | `gpt-4o` -> `gpt-5.4` |

## Supported models

OpenAI, Anthropic, Google, xAI (Grok), Meta (Llama), Mistral, DeepSeek, Moonshot (Kimi), Alibaba (Qwen), MiniMax -- including prefixed variants for OpenRouter, AWS Bedrock, LiteLLM, Together AI, and Groq.

See the full [upgrade map](data/upgrades.json).

## Action inputs / outputs

| Input | Default | Description |
|-------|---------|-------------|
| `token` | `github.token` | GitHub token with `contents:write` and `pull-requests:write` |
| `directory` | `.` | Directory to scan |
| `base-branch` | `main` | Base branch for the PR |
| `extensions` | `""` | Extra file extensions to scan (comma-separated, e.g. `".txt,.cfg"`) |

| Output | Description |
|--------|-------------|
| `pr-url` | URL of the created PR (empty if none) |
| `upgrades-found` | `true` / `false` |

The action never creates duplicate PRs. Open or rejected PRs block new ones; merged PRs don't.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE AUTHORS AND CONTRIBUTORS SHALL NOT BE HELD LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE, INCLUDING BUT NOT LIMITED TO: incorrect or incompatible model upgrade suggestions, breaking changes to your codebase resulting from applied upgrades, third-party API changes or outages, data loss, service interruptions, or any direct, indirect, incidental, or consequential damages.

Model upgrade mappings are provided on a best-effort basis and may be inaccurate, incomplete, or unsuitable for your use case. You are solely responsible for reviewing and testing all changes before merging. Use of this tool in production environments is at your own risk.

By using this software, you acknowledge that you have read this disclaimer and agree to its terms.

## License

MIT
