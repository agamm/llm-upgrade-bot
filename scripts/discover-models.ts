import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
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
import { classifyNewModels, prefilter } from '../src/core/ai-classifier.js'
import { stripPrefix } from '../src/core/variants.js'

const CLASSIFY_BATCH_SIZE = 20

const DATA_DIR = join(import.meta.dirname, '..', 'data')
const FAMILIES_PATH = join(DATA_DIR, 'families.json')
const UPGRADES_PATH = join(DATA_DIR, 'upgrades.json')
const REPORT_PATH = join(DATA_DIR, 'discovery-report.md')

function generateReport(
  newModels: string[],
  classified: string[],
  unclassified: string[],
  skipped: string[],
): string {
  const lines: string[] = ['## Model Discovery Report\n']

  if (newModels.length === 0) {
    lines.push('No new models discovered.\n')
  } else {
    lines.push(`Found ${String(newModels.length)} new model(s):\n`)
    if (classified.length > 0) {
      lines.push(`### Classified (${String(classified.length)})\n`)
      for (const m of classified) lines.push(`- \`${m}\``)
      lines.push('')
    }
    if (unclassified.length > 0) {
      lines.push(`### Unclassified (${String(unclassified.length)})\n`)
      lines.push('These models need manual placement in `data/families.json`:\n')
      for (const m of unclassified) lines.push(`- \`${m}\``)
      lines.push('')
    }
  }

  if (skipped.length > 0) {
    lines.push('### Skipped Providers\n')
    for (const s of skipped) lines.push(`- ${s}`)
    lines.push('')
  }

  return lines.join('\n')
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
    await writeFile(REPORT_PATH, generateReport([], [], [], skipped), 'utf-8')

    // Still derive and write upgrades.json to ensure it stays in sync
    const upgradeMap = deriveUpgradeMap(families)
    await writeFile(UPGRADES_PATH, JSON.stringify(upgradeMap) + '\n', 'utf-8')
    console.log(`Wrote ${String(Object.keys(upgradeMap).length)} entries to upgrades.json`)
    process.exit(0)
  }

  // 6. AI classification — capped to avoid long runs; remaining picked up next run
  const batch = newModels.slice(0, CLASSIFY_BATCH_SIZE)
  const deferred = newModels.slice(CLASSIFY_BATCH_SIZE)
  if (deferred.length > 0) {
    console.log(`Classifying ${String(batch.length)} of ${String(newModels.length)} (${String(deferred.length)} deferred to next run)`)
  }
  const { families: updatedFamilies, unclassified } =
    await classifyNewModels(families, batch)

  const classified = batch.filter((m) => !unclassified.includes(m))
  console.log(
    `Classified: ${String(classified.length)}, Unclassified: ${String(unclassified.length)}` +
    (deferred.length > 0 ? `, Deferred: ${String(deferred.length)}` : ''),
  )

  // 7. Write updated families.json (only if models were classified)
  if (classified.length > 0) {
    await writeFile(FAMILIES_PATH, JSON.stringify(updatedFamilies) + '\n', 'utf-8')
    console.log(`Updated families.json`)
  }

  // 8. Derive and write upgrades.json
  const upgradeMap = deriveUpgradeMap(updatedFamilies)
  await writeFile(UPGRADES_PATH, JSON.stringify(upgradeMap) + '\n', 'utf-8')
  console.log(`Wrote ${String(Object.keys(upgradeMap).length)} entries to upgrades.json`)

  // 9. Write report
  const report = generateReport(newModels, classified, unclassified, skipped)
  await writeFile(REPORT_PATH, report, 'utf-8')
  console.log(`Report written to ${REPORT_PATH}`)
}

main().catch((err: unknown) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
