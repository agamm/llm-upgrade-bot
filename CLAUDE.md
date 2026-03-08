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

## Code Style
- Functional-first: pure functions, no classes, data-in/data-out
- Result types for errors: `{ ok: true, data } | { ok: false, error }` — no thrown exceptions in core/
- camelCase functions/variables, PascalCase types/interfaces

## Architecture
- `src/core/` — scanner, upgrade-map, fixer (platform-agnostic, no I/O opinions)
- `src/cli/` — Commander.js commands, terminal output (picocolors + nanospinner)
- `action.yml` — composite GitHub Action (no src/action/ dir, delegates to CLI + peter-evans/create-pull-request)
- Dependency direction: cli/ → core/. Core never imports from cli.
- `data/upgrades.json` — flat map `{ "old-model": { "safe": "...", "major": "..." } }`

## Guardrails
- **Max file:** 200 lines — refactor before exceeding
- **Max function:** 30 lines — decompose if longer
- **Tests required for:** all core/ functions, CLI integration tests
- **Before adding deps:** check Node.js stdlib first. Justify every new package.
- **Forbidden:** `any` types, inline secrets, `console.log` for user output (use reporter), circular imports between layers
- **Pause for review before:** new files, new npm deps, architecture changes
- **CLAUDE.md updates:** when adding commands, changing architecture, or discovering gotchas

## Key Patterns
- Two-pass scanning: prefix filter (fast) → precise match against upgrade map
- upgrades.json values are objects `{ safe, major }` not plain strings
- Fetch latest upgrades.json from URL at runtime, fall back to bundled
- Exit code: 0 = no upgrades, 1 = upgrades available

## GitHub Action Versioning
- Published on GitHub Marketplace. Users pin to major version tag: `uses: agamm/llm-upgrade-bot@v1`
- **On every release:** create a semver tag (e.g. `v1.0.0`, `v1.1.0`) and force-update the major tag:
  ```
  git tag v1.x.x && git push origin v1.x.x
  git tag -f v1 && git push -f origin v1
  ```
- **Breaking changes** (action input/output removals, behavior changes): bump major tag (`v2`)
- `dist/` must be committed and included in the tag — the composite action runs `node $ACTION_PATH/dist/cli.js`
- `action.yml` has `branding` for Marketplace (icon: refresh-cw, color: blue)
- README install button uses `@main` for now — update to `@v1` after first stable release
- See: https://docs.github.com/en/actions/creating-actions/about-custom-actions#using-tags-for-release-management

## Gotchas
- picocolors uses nesting `pc.bold(pc.red(...))` not chaining
- Commander: use `new Command()` (not global), `parseAsync()` for async, `.exitOverride()` for tests
- pnpm v10+ blocks postinstall scripts by default — use `pnpm.onlyBuiltDependencies`
- tsup: watch `package.json` exports field for ESM/CJS dual output
