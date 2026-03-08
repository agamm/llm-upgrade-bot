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

  // Require all provider API keys (OpenRouter works without auth, xAI optional — no billing yet)
  const optional = new Set(['OpenRouter', 'xAI'])
  const missing = PROVIDER_CONFIGS
    .filter((c) => !optional.has(c.name) && !process.env[c.envVar])
    .map((c) => c.envVar)
  if (missing.length > 0) {
    console.error(`Missing required env vars: ${missing.join(', ')}`)
    process.exit(1)
  }

  console.log(`Fetching models from ${String(PROVIDER_CONFIGS.length)} providers...`)

  const { models, skipped } = await fetchAllProviderModels()

  const requiredFailures = skipped.filter((s) => !optional.has(s.split(':')[0] ?? ''))
  for (const s of skipped) {
    console.warn(`  Skipped: ${s}`)
  }
  if (requiredFailures.length > 0) {
    console.error(`${String(requiredFailures.length)} required provider(s) failed. Aborting.`)
    process.exit(1)
  }

  // Collect all discovered model IDs and build source map (model → providers)
  const allDiscovered: string[] = []
  const sourceMap = new Map<string, string[]>()
  for (const [provider, ids] of Object.entries(models)) {
    console.log(`  ${provider}: ${String(ids.size)} models`)
    for (const id of ids) {
      allDiscovered.push(id)
      const existing = sourceMap.get(id)
      if (existing) existing.push(provider)
      else sourceMap.set(id, [provider])
    }
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
  const safeProposed = detectSafeUpgrades(newModels, map, sourceMap)
  const majorProposed = suggestMajorUpgrades(newModels, map, sourceMap)
  const allProposed = deduplicateProposals([...safeProposed, ...majorProposed])

  console.log(
    `Proposed: ${String(safeProposed.length)} safe, ${String(majorProposed.length)} major (${String(allProposed.length)} after dedup)`,
  )

  // Apply proposed entries to map
  for (const p of allProposed) {
    map[p.key] = p.entry
  }

  // Write updated map — preserve compact one-line-per-entry format
  // Read original to patch in-place, keeping blank-line grouping intact
  const lines = raw.split('\n')
  const updatedKeys = new Set(allProposed.map((p) => p.key))
  const result: string[] = []

  for (const line of lines) {
    // Match existing entries: `  "model-id": { ... }`
    const keyMatch = /^\s+"([^"]+)":\s*\{/.exec(line)
    if (keyMatch && updatedKeys.has(keyMatch[1])) {
      const key = keyMatch[1]
      const entry = map[key]
      if (entry) {
        const safe = entry.safe === null ? 'null' : `"${entry.safe}"`
        const major = entry.major === null ? 'null' : `"${entry.major}"`
        const comma = line.trimEnd().endsWith(',') ? ',' : ''
        result.push(`  "${key}": { "safe": ${safe}, "major": ${major} }${comma}`)
        continue
      }
    }
    result.push(line)
  }

  await writeFile(UPGRADES_PATH, result.join('\n'), 'utf-8')

  // Write report
  const report = generateReport(allProposed, skipped)
  await writeFile(REPORT_PATH, report, 'utf-8')
  console.log(`Report written to ${REPORT_PATH}`)
}

main().catch((err: unknown) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
