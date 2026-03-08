import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpgradeMap } from '../src/core/types.js'

// Load .env file if present (local dev only — CI uses secrets)
const envPath = join(import.meta.dirname, '..', '.env')
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim()
    if (trimmed === '' || trimmed.startsWith('#')) continue
    const eq = trimmed.indexOf('=')
    if (eq < 0) continue
    const key = trimmed.slice(0, eq)
    const value = trimmed.slice(eq + 1)
    if (!process.env[key]) process.env[key] = value
  }
}

import {
  fetchAllProviderModels,
  filterChatModels,
  diffModels,
  detectSafeUpgrades,
  suggestMajorUpgrades,
  generateReport,
  PROVIDER_CONFIGS,
} from '../src/core/model-discovery.js'
import type { ProposedEntry } from '../src/core/model-discovery.js'

const DATA_DIR = join(import.meta.dirname, '..', 'data')
const UPGRADES_PATH = join(DATA_DIR, 'upgrades.json')
const REPORT_PATH = join(DATA_DIR, 'discovery-report.md')

function deduplicateProposals(proposals: ProposedEntry[]): ProposedEntry[] {
  const byKey = new Map<string, ProposedEntry>()
  for (const p of proposals) {
    const existing = byKey.get(p.key)
    // Prefer 'auto' over 'suggested', keep first auto or last suggested
    if (!existing || (p.confidence === 'auto' && existing.confidence !== 'auto')) {
      byKey.set(p.key, p)
    }
  }
  return [...byKey.values()]
}

async function main() {
  const raw = await readFile(UPGRADES_PATH, 'utf-8')
  const map: UpgradeMap = JSON.parse(raw)
  const knownKeys = new Set(Object.keys(map))

  console.log(`Loaded ${String(knownKeys.size)} known model entries`)
  console.log(`Fetching models from ${String(PROVIDER_CONFIGS.length)} providers...`)

  const { models, skipped } = await fetchAllProviderModels()

  for (const s of skipped) {
    console.warn(`  Skipped: ${s}`)
  }

  // Bail if no providers responded at all
  const providerCount = Object.keys(models).length
  if (providerCount === 0) {
    console.error('No providers responded. Aborting.')
    await writeFile(REPORT_PATH, generateReport([], skipped), 'utf-8')
    process.exit(1)
  }

  // Collect all discovered model IDs
  const allDiscovered: string[] = []
  for (const [provider, ids] of Object.entries(models)) {
    console.log(`  ${provider}: ${String(ids.size)} models`)
    allDiscovered.push(...ids)
  }

  // Diff and filter
  const newModels = filterChatModels(diffModels(knownKeys, allDiscovered))
  console.log(`Found ${String(newModels.length)} new chat model(s)`)

  if (newModels.length === 0) {
    console.log('No new models to process.')
    await writeFile(REPORT_PATH, generateReport([], skipped), 'utf-8')
    process.exit(0)
  }

  // Detect upgrades and deduplicate
  const safeProposed = detectSafeUpgrades(newModels, map)
  const majorProposed = suggestMajorUpgrades(newModels, map)
  const allProposed = deduplicateProposals([...safeProposed, ...majorProposed])

  console.log(
    `Proposed: ${String(safeProposed.length)} safe, ${String(majorProposed.length)} major (${String(allProposed.length)} after dedup)`,
  )

  // Apply proposed entries to map
  for (const p of allProposed) {
    map[p.key] = p.entry
  }

  // Write updated map (preserve compact format)
  await writeFile(UPGRADES_PATH, JSON.stringify(map, null, 2) + '\n', 'utf-8')

  // Write report
  const report = generateReport(allProposed, skipped)
  await writeFile(REPORT_PATH, report, 'utf-8')
  console.log(`Report written to ${REPORT_PATH}`)
}

main().catch((err: unknown) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
