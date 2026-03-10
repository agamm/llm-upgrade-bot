# Discovery Rework: families.json + AI-Assisted Updates

## Why

The current discovery system uses brittle regex parsing (`VERSION_PATTERN`, `NOISE_TOKENS`,
`NON_CHAT_PATTERN`, `normalizeVersionSeparators`, `extractModelAttributes`) to understand model IDs.
Every new provider naming convention requires patching shared regex code, risking regressions.
This is the #1 maintenance burden.

## Design Decisions

### families.json as source of truth
- Nested arrays: outer = major progression (generations), inner = safe upgrades within a generation
- Human-readable and auditable — no regex needed to understand model relationships
- Un-timestamped aliases go LAST in inner arrays (they act as "latest" pointers)
- All version-digit separators use **dots** (canonical form). Derivation generates both dot/hyphen variants.

### upgrades.json becomes derived
- `deriveUpgradeMap(families)` produces upgrades.json deterministically
- `safe` = last model in same inner array (null if model IS the last)
- `major` = last model of last inner array in entire lineage (null if same as safe, or if model IS in the last inner array and IS the last)
- Separator variants auto-generated (4.6 also emits 4-6)
- Prefix variants (openai/X, anthropic/X) auto-derived from native lineages

### AI classification replaces regex
- Claude Agent SDK with WebSearch/WebFetch classifies new models
- More robust than regex for unknown naming conventions
- Creates new lineage for truly unknown models rather than guessing

### Scanner handles colon-tagged variants
- OpenRouter tags like `:free`, `:exact`, `:nitro` are stripped at scan time
- If `"gpt-4o:free"` is found, scanner looks up `gpt-4o` and appends `:free` to upgrade targets
- This keeps upgrades.json small — no need for colon-variant entries

## What Gets Deleted
- `src/core/model-version.ts` (~113 lines of regex parsing)
- `test/core/model-version.test.ts` (~217 lines)
- Detection logic from `model-discovery.ts` (detectSafeUpgrades, suggestMajorUpgrades, etc.)

## What Stays
- `scanner.ts` — exact hash lookup (plus colon-tag stripping)
- `upgrade-map.ts`, `prefix-filter.ts`, `fixer.ts` — unchanged
- Provider fetching in `model-discovery.ts` — unchanged
- All CLI code — unchanged

## Net Effect
~400 lines of brittle regex/heuristic code removed, replaced by ~200 lines of clean derivation + AI classification.
