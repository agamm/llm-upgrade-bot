# llm-upgrade-bot

**Dependabot for LLM model versions.** Scans your codebase for outdated model strings and opens PRs to upgrade them.

[![GitHub Marketplace](https://img.shields.io/badge/Marketplace-LLM%20Upgrade%20Bot-blue?logo=github)](https://github.com/marketplace/actions/llm-upgrade-bot)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

Hardcoded `gpt-5.4`, `claude-3-opus`, or `gemini-3.1-pro-preview`? This tool finds them and upgrades to the latest versions -- across **720+ upgrade entries** from 50 model families spanning OpenAI, Anthropic, Google, xAI, Meta, Mistral, DeepSeek, Moonshot, Qwen, MiniMax, and more.

```
$ llm-upgrade-bot ./src

  src/config.yaml:3  "claude-3-opus"
    -> major: claude-opus-4.6

  src/lib/router.ts:3  "gpt-5-mini"
    -> major: gpt-5-mini

  Found 2 upgradable models in 2 files
```

## Quick start — GitHub Action

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

> **Note:** You need to enable **"Allow GitHub Actions to create and approve pull requests"** in your repo settings (Settings → Actions → General), otherwise the PR step will fail. You can also enable it via CLI:
> ```bash
> gh api repos/OWNER/REPO/actions/permissions/workflow -X PUT --input - <<< '{"can_approve_pull_request_reviews":true,"default_workflow_permissions":"write"}'
> ```

## CLI usage

```bash
npx llm-upgrade-bot ./your-project          # scan
npx llm-upgrade-bot ./your-project --fix     # auto-fix
npx llm-upgrade-bot ./your-project --json    # machine-readable
npx llm-upgrade-bot ./your-project --force   # include safe upgrades for date-pinned models
npx llm-upgrade-bot . --extensions ".txt,.rst"   # add extra file types
npx llm-upgrade-bot . --include "src/**"          # only scan matching files
npx llm-upgrade-bot . --include "test/**,src/**"  # include test dirs (excluded by default)
```

> **Date-pinned models** like `gpt-4o-2024-05-13` are treated as intentionally pinned. By default, only major upgrades are shown for them. Use `--force` to also see safe (same-generation) upgrades.

## How it works

We continuously scan 8 provider APIs (OpenAI, Anthropic, Google, DeepSeek, xAI, Together AI, Groq, and more) to detect new models and automatically classify them into [model families](data/families.json). You don't need to supply any API keys -- we take care of keeping the model data fresh.

When the action runs in your repo, it:

1. **Fetches** the latest upgrade map with 720+ entries (always up-to-date)
2. **Scans** your files and matches model strings against it (including bare model names in `.md`/`.mdx` docs)
3. **Classifies** each match as a **safe** upgrade (same family, newer version) and/or a **major** upgrade (latest in capability tier)
4. **Fixes** files in-place, preferring safe upgrades
5. **Opens a PR** with a summary table of all changes

| Tier | Meaning | Example |
|------|---------|---------|
| safe | Same generation, newer version | `llama-3.1-70b-instruct` -> `llama-3.3-70b-instruct` |
| major | Latest model in capability tier | `gpt-4o` -> `gpt-5.4` |

Test directories (`test/`, `tests/`, `__tests__/`, `spec/`, `fixtures/`, etc.) and test files (`*.test.ts`, `*_test.go`, `*Test.java`, etc.) are excluded by default. Use `--include "test/**"` to scan them.

## Supported models

50 model families across 14 provider groups -- OpenAI, Anthropic, Google, xAI (Grok), Meta (Llama), Mistral, DeepSeek, Moonshot (Kimi), Alibaba (Qwen), MiniMax, Aion -- including prefixed variants for OpenRouter, AWS Bedrock, LiteLLM, Together AI, and Groq.

The scanner also handles `-latest` aliases (e.g. `mistral-large-latest`) and OpenRouter colon tags (`:free`, `:nitro`) by stripping them at scan time and re-appending to upgrade targets.

See the full [model families](data/families.json) or [upgrade map](data/upgrades.json).

## Privacy

**100% open source. Your code never leaves your repo.** The tool is designed to run inside your own GitHub Actions runner or locally as a CLI. The only network request is fetching the public [upgrade map](data/upgrades.json) — a static JSON file. No code is uploaded or shared. No API keys required. Works offline with the bundled fallback map.

## Action inputs / outputs

| Input | Default | Description |
|-------|---------|-------------|
| `token` | `github.token` | GitHub token with `contents:write` and `pull-requests:write` |
| `directory` | `.` | Directory to scan |
| `base-branch` | `main` | Base branch for the PR |
| `extensions` | `""` | Extra file extensions to scan (comma-separated, e.g. `".txt,.cfg"`) |
| `include` | `""` | Only scan files matching these globs (comma-separated, e.g. `"src/**,*.config.ts"`) |

| Output | Description |
|--------|-------------|
| `pr-url` | URL of the created PR (empty if none) |
| `upgrades-found` | `true` / `false` |

The action never creates duplicate PRs. Open or rejected PRs block new ones; merged PRs don't.

## Install with your AI coding agent

Copy this prompt into Claude Code, Codex, or your preferred AI coding agent:

```
Read https://github.com/agamm/llm-upgrade-bot#quick-start--github-action and set up llm-upgrade-bot in this repo. Create the GitHub Actions workflow file and enable the required permissions.
```

## Status

This project is a **work in progress**. Model families are auto-discovered and classified by AI, so mistakes can happen. If you spot a wrong upgrade suggestion, please [open an issue](https://github.com/agamm/llm-upgrade-bot/issues) -- and check [`data/families.json`](data/families.json) since that's the source of truth for all upgrade paths.

## Disclaimer

THIS SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED. THE AUTHORS AND CONTRIBUTORS SHALL NOT BE HELD LIABLE FOR ANY CLAIM, DAMAGES, OR OTHER LIABILITY ARISING FROM THE USE OF THIS SOFTWARE, INCLUDING BUT NOT LIMITED TO: incorrect or incompatible model upgrade suggestions, breaking changes to your codebase resulting from applied upgrades, third-party API changes or outages, data loss, service interruptions, or any direct, indirect, incidental, or consequential damages.

Model upgrade mappings are provided on a best-effort basis and may be inaccurate, incomplete, or unsuitable for your use case. You are solely responsible for reviewing and testing all changes before merging. Use of this tool in production environments is at your own risk.

By using this software, you acknowledge that you have read this disclaimer and agree to its terms.

## License

MIT
