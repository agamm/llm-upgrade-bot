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
- Validate: `pnpm validate` (variant consistency + families.json derivation check)
- Discover: `pnpm discover` (fetch provider APIs, classify new models, derive upgrades.json)

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
- `data/families.json` — source of truth: nested arrays of model progressions (outer = major generations, inner = safe upgrades). Dots canonical for version separators. Un-timestamped aliases go last in inner arrays.
- `data/upgrades.json` — **derived** from families.json via `deriveUpgradeMap()`. Flat map `{ "model-id": { "safe": "...", "major": "..." } }`. Includes separator variants (dot↔hyphen) and prefix variants (openai/, anthropic/, etc.)
- `src/core/families.ts` — load/query families.json
- `src/core/derive-upgrades.ts` — pure derivation: families.json → upgrades.json (separator variants, prefix variants)
- `src/core/ai-classifier.ts` — AI-assisted classification of new models via Claude Agent SDK (WebSearch + WebFetch + structured output)

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
- `model-discovery` fetches 8 provider APIs, diffs new models; sanitizes error messages to prevent API key leaks
- Scanner strips OpenRouter colon tags (`:free`, `:exacto`, `:nitro`) at scan time — no need for colon-tagged entries in upgrades.json
- `derive-upgrades` generates separator variants (4.6→4-6) and prefix variants (openai/X, anthropic/X) from native lineages via `PREFIX_RULES`
- Cross-tier prevention: families.json separates mini/nano/flagship into distinct lineages by design
- AI classifier pre-filters structural noise (fine-tunes, colon-tagged, org-scoped) before sending to the agent — all other relevance decisions (non-chat models, provider prefixes) are left to the AI
- Agent SDK `outputFormat` returns structured JSON (placements + newLineages + unclassified) — no regex parsing of agent text
- `.github/workflows/discover-models.yml` — hourly auto-discovery, opens PR via peter-evans/create-pull-request (commits upgrades.json + families.json)

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
- Current version: **v1.6.0**

## Gotchas
- Version components in model IDs are 1–2 digits. 3+ digit components (e.g., `0905`, `0711`) are date/build codes — `toHyphenVariant` and `isVersionSequence` in derive-upgrades.ts skip them
- Colon-tagged models (`:free`, `:exacto`, `:nitro`) are OpenRouter variant tags — scanner strips them at scan time, discovery skips them as new models
- picocolors uses nesting `pc.bold(pc.red(...))` not chaining
- Commander: use `new Command()` (not global), `parseAsync()` for async, `.exitOverride()` for tests
- pnpm v10+ blocks postinstall scripts by default — use `pnpm.onlyBuiltDependencies`
- tsup: watch `package.json` exports field for ESM/CJS dual output
- Agent SDK (`@anthropic-ai/claude-agent-sdk`) requires `ANTHROPIC_API_KEY` — classifier gracefully falls back to all-unclassified if missing
- `prefilter()` only strips structural noise (fine-tunes, colon-tagged, org-scoped) — resist adding content-based heuristics (embed, tts, etc.), let the AI judge relevance
