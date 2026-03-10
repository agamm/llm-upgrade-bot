import { readFile, writeFile } from 'node:fs/promises'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { UpgradeMap } from '../src/core/types.js'

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
  detectSafeUpgrades,
  suggestMajorUpgrades,
  generateReport,
  PROVIDER_CONFIGS,
} from '../src/core/model-discovery.js'
import type { ProposedEntry } from '../src/core/model-discovery.js'
import { syncVariantConsistency } from '../src/core/variant-validator.js'

const DATA_DIR = join(import.meta.dirname, '..', 'data')
const UPGRADES_PATH = join(DATA_DIR, 'upgrades.json')
const REPORT_PATH = join(DATA_DIR, 'discovery-report.md')

/** Deduplicate proposals: auto (safe) wins over suggested, merging safe+major fields. */
function deduplicateProposals(proposals: ProposedEntry[]): ProposedEntry[] {
  const byKey = new Map<string, ProposedEntry>()
  for (const p of proposals) {
    const ex = byKey.get(p.key)
    if (!ex) { byKey.set(p.key, p); continue }
    if (p.confidence === 'auto' && ex.confidence !== 'auto') {
      if (!p.entry.major && ex.entry.major) p.entry.major = ex.entry.major
      byKey.set(p.key, p)
    } else if (ex.confidence === 'auto' && p.confidence !== 'auto') {
      if (!ex.entry.major && p.entry.major) ex.entry.major = p.entry.major
    }
  }
  return [...byKey.values()]
}

function formatEntry(entry: { safe: string | null; major: string | null }): string {
  const safe = entry.safe === null ? 'null' : `"${entry.safe}"`
  const major = entry.major === null ? 'null' : `"${entry.major}"`
  return `{ "safe": ${safe}, "major": ${major} }`
}

/** Patch upgrades.json in-place, preserving blank-line grouping. */
async function patchAndWrite(
  raw: string,
  map: UpgradeMap,
  newEntries: Map<string, { safe: string | null; major: string | null }>,
): Promise<void> {
  const lines = raw.split('\n')
  const origMap = JSON.parse(raw) as Record<string, unknown>
  delete origMap['_pinned']
  const updatedKeys = new Set(
    Object.keys(map).filter((k) => JSON.stringify(map[k]) !== JSON.stringify(origMap[k])),
  )
  const result: string[] = []

  for (const line of lines) {
    const keyMatch = /^\s+"([^"]+)":\s*\{/.exec(line)
    if (keyMatch && updatedKeys.has(keyMatch[1]) && map[keyMatch[1]]) {
      const comma = line.trimEnd().endsWith(',') ? ',' : ''
      result.push(`  "${keyMatch[1]}": ${formatEntry(map[keyMatch[1]])}${comma}`)
      continue
    }
    result.push(line)
  }

  if (newEntries.size > 0) {
    const closingIdx = result.lastIndexOf('}')
    if (closingIdx > 0) {
      const prevLine = result[closingIdx - 1]
      if (prevLine && !prevLine.trimEnd().endsWith(',') && !prevLine.trimEnd().endsWith('{')) {
        result[closingIdx - 1] = prevLine.trimEnd() + ','
      }
      const inserts = [...newEntries.entries()].map(([key, entry], i, arr) => {
        const comma = i < arr.length - 1 ? ',' : ''
        return `  "${key}": ${formatEntry(entry)}${comma}`
      })
      result.splice(closingIdx, 0, ...inserts)
    }
  }

  await writeFile(UPGRADES_PATH, result.join('\n'), 'utf-8')
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

  // Sync variant ↔ native consistency for all touched keys
  const touchedKeys = new Set([...allProposed.map((p) => p.key), ...newEntries.keys()])
  const syncCount = syncVariantConsistency(map, touchedKeys)
  if (syncCount > 0) {
    console.log(`Synced ${String(syncCount)} variant field(s) for consistency`)
  }

  await patchAndWrite(raw, map, newEntries)

  // Write report
  const report = generateReport(allProposed, skipped)
  await writeFile(REPORT_PATH, report, 'utf-8')
  console.log(`Report written to ${REPORT_PATH}`)
}

main().catch((err: unknown) => {
  console.error('Discovery failed:', err instanceof Error ? err.message : err)
  process.exit(1)
})
