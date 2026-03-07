# llm-upgrade-bot

**Dependabot for LLM model versions.** Scans your codebase for outdated model strings and opens PRs to upgrade them.

Hardcoded `gpt-4`, `claude-3-opus`, or `gemini-pro`? This tool finds them and upgrades to the latest versions -- across **200+ model strings** from OpenAI, Anthropic, Google, xAI, Meta, Mistral, DeepSeek, Moonshot, Cohere, Qwen, MiniMax, and more.

```
$ llm-upgrade-bot ./src

  src/api.ts:12  "gpt-4o-2024-05-13"
    -> safe:  gpt-4o-2024-11-20
    -> major: gpt-4.1

  src/config.yaml:5  "claude-3-opus-20240229"
    -> major: claude-opus-4-6

  Found 2 upgradable models in 2 files
```

## Install as GitHub Action

Add a workflow to get automatic upgrade PRs -- click the button or copy the YAML below.

[<img src="https://img.shields.io/badge/Install_GitHub_Action-2ea44f?style=for-the-badge&logo=githubactions&logoColor=white" alt="Install GitHub Action" height="36">](https://github.com/agamm/llm-upgrade-bot/new/main/.github/workflows?filename=llm-upgrades.yml&value=name%3A%20LLM%20Model%20Upgrades%0Aon%3A%0A%20%20schedule%3A%0A%20%20%20%20-%20cron%3A%20%270%20*%2F6%20*%20*%20*%27%20%20%23%20Every%206%20hours%0A%20%20workflow_dispatch%3A%0A%0Apermissions%3A%0A%20%20contents%3A%20write%0A%20%20pull-requests%3A%20write%0A%0Ajobs%3A%0A%20%20upgrade%3A%0A%20%20%20%20runs-on%3A%20ubuntu-latest%0A%20%20%20%20steps%3A%0A%20%20%20%20%20%20-%20uses%3A%20actions%2Fcheckout%40v4%0A%20%20%20%20%20%20-%20uses%3A%20agamm%2Fllm-upgrade-bot%40main%0A)

<details>
<summary>Or copy the workflow YAML manually</summary>

```yaml
# .github/workflows/llm-upgrades.yml
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
      - uses: agamm/llm-upgrade-bot@main
```

</details>

## CLI usage

```bash
npx llm-upgrade-bot ./your-project        # scan
npx llm-upgrade-bot ./your-project --fix   # auto-fix
npx llm-upgrade-bot ./your-project --json  # machine-readable
npx llm-upgrade-bot . --extensions ".txt,.rst"  # add extra file types
```

## How it works

1. **Scan** -- walks your files and matches model strings against an [upgrade map](data/upgrades.json) of 200+ entries
2. **Classify** -- each match gets a **safe** upgrade (same family, newer version) and/or a **major** upgrade (next-gen model)
3. **Fix** -- rewrites files in-place, preferring safe upgrades
4. **PR** -- as a GitHub Action, creates a PR with a summary table of all changes

| Tier | Meaning | Example |
|------|---------|---------|
| safe | Same family, newer version | `gpt-4o-2024-05-13` -> `gpt-4o-2024-11-20` |
| major | Next-generation model | `gpt-4o` -> `gpt-4.1` |

## Supported models

OpenAI, Anthropic, Google, xAI (Grok), Meta (Llama), Mistral, DeepSeek, Moonshot (Kimi), Cohere (Command), Alibaba (Qwen), MiniMax -- including prefixed variants for OpenRouter, AWS Bedrock, and LiteLLM.

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

## License

MIT
