import { writeFile } from 'node:fs/promises'
import { existsSync, readFileSync, appendFileSync } from 'node:fs'
import { join } from 'node:path'

// Load .env file if present (local dev only — CI uses secrets)
const envPath = join(import.meta.dirname, '..', '.env')
if (existsSync(envPath)) {
  for (const raw of readFileSync(envPath, 'utf-8').split('\n')) {
    const l = raw.trim()
    if (!l || l.startsWith('#')) continue
    const eq = l.indexOf('=')
    if (eq > 0 && !process.env[l.slice(0, eq)]) process.env[l.slice(0, eq)] = l.slice(eq + 1)
  }
}

import {
  fetchAllProviderModels,
  filterChatModels,
  diffModels,
  PROVIDER_CONFIGS,
} from '../src/core/model-discovery.js'
import { loadFamilies, allModelsInFamilies } from '../src/core/families.js'
import { deriveUpgradeMap } from '../src/core/derive-upgrades.js'
import { stripPrefix, prefilter } from '../src/core/variants.js'

const DATA_DIR = join(import.meta.dirname, '..', 'data')
const FAMILIES_PATH = join(DATA_DIR, 'families.json')
const UPGRADES_PATH = join(DATA_DIR, 'upgrades.json')
const NEW_MODELS_PATH = join(DATA_DIR, 'new-models.txt')

function setGitHubOutput(key: string, value: string): void {
  const outputFile = process.env['GITHUB_OUTPUT']
  if (outputFile) {
    appendFileSync(outputFile, `${key}=${value}\n`)
  }
}

async function main() {
  // 1. Load families.json
  const familiesResult = loadFamilies(FAMILIES_PATH)
  if (!familiesResult.ok) {
    console.error(familiesResult.error)
    process.exit(1)
  }
  const families = familiesResult.data
  const knownModels = allModelsInFamilies(families)

  // Also load derived upgrade map to include separator/prefix variants as known
  const derivedMap = deriveUpgradeMap(families)
  const allKnownKeys = new Set([...knownModels, ...Object.keys(derivedMap)])

  console.log(
    `Loaded ${String(Object.keys(families).length)} families (${String(knownModels.size)} models, ${String(allKnownKeys.size)} with variants)`,
  )

  // 2. Check required provider keys
  const optional = new Set(['OpenRouter', 'xAI', 'Together'])
  const missing = PROVIDER_CONFIGS
    .filter((c) => !optional.has(c.name) && !process.env[c.envVar])
    .map((c) => c.envVar)
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  // 3. Fetch from all providers
  console.log(`Fetching models from ${String(PROVIDER_CONFIGS.length)} providers...`)
  const { models, skipped } = await fetchAllProviderModels()

  const requiredFailures = skipped.filter((s) => !optional.has(s.split(':')[0] ?? ''))
  for (const s of skipped) console.warn(`  Skipped: ${s}`)
  if (requiredFailures.length > 0) {
    console.error(`${String(requiredFailures.length)} required provider(s) failed. Aborting.`)
    process.exit(1)
  }

  // 4. Collect all discovered model IDs
  const allDiscovered: string[] = []
  for (const [provider, ids] of Object.entries(models)) {
    console.log(`  ${provider}: ${String(ids.size)} models`)
    for (const id of ids) allDiscovered.push(id)
  }

  // 5. Strip prefixes, deduplicate, diff against known, filter noise
  const seen = new Set<string>()
  const deduped: string[] = []
  for (const id of allDiscovered) {
    const bare = stripPrefix(id)
    if (!seen.has(bare)) {
      seen.add(bare)
      deduped.push(bare)
    }
  }

  const rawNew = filterChatModels(diffModels(allKnownKeys, deduped))
    .filter((id) => !/:[a-zA-Z]/.test(id))
  const newModels = prefilter(rawNew)
  console.log(`Found ${String(rawNew.length)} new chat model(s), ${String(newModels.length)} after pre-filtering`)

  if (newModels.length === 0) {
    console.log('No new models to process.')
    setGitHubOutput('has_new_models', 'false')

    // Still derive and write upgrades.json to ensure it stays in sync
    const upgradeMap = deriveUpgradeMap(families)
    await writeFile(UPGRADES_PATH, JSON.stringify(upgradeMap) + '\n', 'utf-8')
    console.log(`Wrote ${String(Object.keys(upgradeMap).length)} entries to upgrades.json`)
    process.exit(0)
  }

  // 6. Write new model IDs to file for Claude Code Action to classify
  await writeFile(NEW_MODELS_PATH, newModels.join('\n') + '\n', 'utf-8')
  console.log(`Wrote ${String(newModels.length)} new model(s) to ${NEW_MODELS_PATH}`)
  setGitHubOutput('has_new_models', 'true')
}

main().catch((err: unknown) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
