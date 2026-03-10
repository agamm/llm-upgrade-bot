# llm-upgrade-bot

TypeScript CLI + GitHub Action — scans codebases for outdated LLM model strings and proposes upgrades.

## Commands
- Build: `pnpm build` (tsup)
- Dev: `pnpm dev` (tsx)
- Test: `pnpm test` (vitest)
- Test single: `pnpm test -- path/to/file`
- Lint: `pnpm lint` (eslint)
- Format: `pnpm format` (prettier)
- Typecheck: `pnpm typecheck` (tsc --noEmit)
- Validate: `pnpm validate` (variant consistency checks on upgrades.json)
- Discover: `pnpm discover` (fetch provider APIs, propose new upgrade paths)

## Code Style
- Functional-first: pure functions, no classes, data-in/data-out
- Result types for errors: `{ ok: true, data } | { ok: false, error }` — no thrown exceptions in core/
- camelCase functions/variables, PascalCase types/interfaces

## Architecture
- `src/core/` — scanner, upgrade-map, fixer, variant-validator, model-discovery (platform-agnostic, no I/O opinions)
- `scripts/` — validate-variants.ts, discover-models.ts (CLI entry points for maintenance tasks)
- `src/cli/` — Commander.js commands, terminal output (picocolors + nanospinner)
- `action.yml` — composite GitHub Action (no src/action/ dir, delegates to CLI + peter-evans/create-pull-request)
- Dependency direction: cli/ → core/. Core never imports from cli.
- `data/upgrades.json` — auto-discovered flat map `{ "old-model": { "safe": "...", "major": "..." } }` with `_pinned` array for manually curated keys that discovery won't overwrite

## Guardrails
- **Max file:** 200 lines — refactor before exceeding
- **Max function:** 30 lines — decompose if longer
- **Tests required for:** all core/ functions, CLI integration tests. When fixing production bugs, always add a regression test for the specific edge case before fixing.
- **Before adding deps:** check Node.js stdlib first. Justify every new package.
- **Forbidden:** `any` types, inline secrets, `console.log` for user output (use reporter), circular imports between layers
- **Pause for review before:** new files, new npm deps, architecture changes
- **CLAUDE.md updates:** when adding commands, changing architecture, or discovering gotchas

## Key Patterns
- Two-pass scanning: prefix filter (fast) → precise match against upgrade map
- Markdown scanning: `.md`/`.mdx` files also match bare (unquoted) model names; skips `{model}`, `"model"`, `` `model` `` (already caught by quote regexes)
- upgrades.json values are objects `{ safe, major }` not plain strings
- Fetch latest upgrades.json from URL at runtime, fall back to bundled
- Exit code: 0 = no upgrades, 1 = upgrades available
- Provider variants: Native, OpenRouter (covers LiteLLM + Vercel), Bedrock, Together AI (PascalCase), Groq (custom aliases)
- `variant-validator` checks cross-variant consistency (OpenRouter entries match native)
- `model-version` parses version strings and normalizes suffixes to canonical tiers via positive allowlist (TIER_TOKENS); noise words like `-preview`, `-latest` are auto-ignored
- `model-discovery` fetches 7 provider APIs, diffs, detects safe/major upgrades via date/version heuristics; sanitizes error messages to prevent API key leaks
- Discovery refreshes stale major targets: if a newer model in the same line/tier is found, it proposes updating the existing major target
- "major" tier targets the **latest** model in the same capability tier (e.g. flagship→flagship), not just one generation ahead
- `.github/workflows/discover-models.yml` — hourly auto-discovery, opens PR via peter-evans/create-pull-request (only commits upgrades.json, report goes in PR body)

## GitHub Action Versioning
- Published on GitHub Marketplace. Users pin to major version tag: `uses: agamm/llm-upgrade-bot@v1`
- **After every fix/feature that affects the action or dist/:**
  1. Run `pnpm build` to rebuild `dist/`
  2. Commit the updated `dist/` files (force-add: `git add -f dist/`)
  3. Bump version: patch for fixes (`v1.0.1`), minor for features (`v1.1.0`)
  4. Tag and push:
     ```
     git tag v1.x.x && git push origin v1.x.x
     git tag -f v1 && git push -f origin v1
     ```
  5. Create a GitHub release: `gh release create v1.x.x --title "v1.x.x" --generate-notes`
- **Breaking changes** (action input/output removals, behavior changes): bump major tag (`v2`)
- `dist/` is in `.gitignore` but force-tracked — the composite action runs `node $ACTION_PATH/dist/cli.js`
- `action.yml` has `branding` for Marketplace (icon: refresh-cw, color: blue)
- Current version: **v1.5.13**

## Gotchas
- Version components in model IDs are 1–2 digits. 3+ digit components (e.g., `0905`, `0711`) are date/build codes — `normalizeVersionSeparators` and `matchSeparatorStyle` skip them
- Colon-tagged models (`:free`, `:exacto`, `:nitro`) are OpenRouter variant tags, not real models — discovery skips them as upgrade targets
- picocolors uses nesting `pc.bold(pc.red(...))` not chaining
- Commander: use `new Command()` (not global), `parseAsync()` for async, `.exitOverride()` for tests
- pnpm v10+ blocks postinstall scripts by default — use `pnpm.onlyBuiltDependencies`
- tsup: watch `package.json` exports field for ESM/CJS dual output
