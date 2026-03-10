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
  const parsed = JSON.parse(raw) as Record<string, unknown>
  const pinnedKeys = new Set<string>(
    Array.isArray(parsed['_pinned']) ? (parsed['_pinned'] as string[]) : [],
  )
  delete parsed['_pinned']
  const map = parsed as UpgradeMap
  const knownKeys = new Set(Object.keys(map))

  if (pinnedKeys.size > 0) {
    console.log(`Loaded ${String(pinnedKeys.size)} pinned keys (protected)`)
  }
  console.log(`Loaded ${String(knownKeys.size)} known model entries`)

  // Require all provider API keys (some optional — see GitHub issues)
  const optional = new Set(['OpenRouter', 'xAI', 'Together'])
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

  // Detect upgrades, deduplicate, and exclude pinned keys
  const safeProposed = detectSafeUpgrades(newModels, map, sourceMap)
  const majorProposed = suggestMajorUpgrades(newModels, map, sourceMap)
  const allProposed = deduplicateProposals([...safeProposed, ...majorProposed])
    .filter((p) => !pinnedKeys.has(p.key))

  console.log(
    `Proposed: ${String(safeProposed.length)} safe, ${String(majorProposed.length)} major (${String(allProposed.length)} after dedup)`,
  )

  // Ensure old replaced major targets get entries pointing to new target
  const newEntries = new Map<string, { safe: string | null; major: string | null }>()
  for (const p of allProposed) {
    const existing = map[p.key]
    if (existing?.major && p.entry.major && existing.major !== p.entry.major) {
      if (!map[existing.major] && !pinnedKeys.has(existing.major)) {
        newEntries.set(existing.major, { safe: null, major: p.entry.major })
      }
    }
  }

  // Apply proposed entries to map
  for (const p of allProposed) {
    map[p.key] = p.entry
  }
  for (const [key, entry] of newEntries) {
    map[key] = entry
  }

  if (newEntries.size > 0) {
    console.log(`Added ${String(newEntries.size)} transitive entry(ies) for replaced major targets`)
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

  // Insert new transitive entries before closing `}`
  if (newEntries.size > 0) {
    const closingIdx = result.lastIndexOf('}')
    if (closingIdx > 0) {
      // Ensure previous line has a trailing comma
      const prevIdx = closingIdx - 1
      const prevLine = result[prevIdx]
      if (prevLine && !prevLine.trimEnd().endsWith(',') && !prevLine.trimEnd().endsWith('{')) {
        result[prevIdx] = prevLine.trimEnd() + ','
      }
      const insertLines: string[] = []
      const entries = [...newEntries.entries()]
      for (let i = 0; i < entries.length; i++) {
        const [key, entry] = entries[i]!
        const safe = entry.safe === null ? 'null' : `"${entry.safe}"`
        const major = entry.major === null ? 'null' : `"${entry.major}"`
        const comma = i < entries.length - 1 ? ',' : ''
        insertLines.push(`  "${key}": { "safe": ${safe}, "major": ${major} }${comma}`)
      }
      result.splice(closingIdx, 0, ...insertLines)
    }
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
