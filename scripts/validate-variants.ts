import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpgradeMap } from '../src/core/types.js'
import { validateUpgradeMap } from '../src/core/variant-validator.js'
import { loadFamilies } from '../src/core/families.js'
import { deriveUpgradeMap } from '../src/core/derive-upgrades.js'

const DATA_DIR = join(import.meta.dirname, '..', 'data')
const UPGRADES_PATH = join(DATA_DIR, 'upgrades.json')
const FAMILIES_PATH = join(DATA_DIR, 'families.json')

async function main() {
  const raw = await readFile(UPGRADES_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  delete parsed['_pinned']
  const map = parsed as UpgradeMap

  console.log(`Validating ${String(Object.keys(map).length)} entries...`)

  // 1. Variant consistency + cross-tier checks
  const result = validateUpgradeMap(map)
  if (!result.ok) {
    console.error(`Found ${String(result.error.length)} validation issue(s):`)
    for (const err of result.error) console.error(`  - ${err}`)
    process.exit(1)
  }
  console.log('Variant validation passed.')

  // 2. Families derivation check: derived map must match committed upgrades.json
  const familiesResult = loadFamilies(FAMILIES_PATH)
  if (!familiesResult.ok) {
    console.error(familiesResult.error)
    process.exit(1)
  }

  const derived = deriveUpgradeMap(familiesResult.data)
  const derivedKeys = new Set(Object.keys(derived))
  const committedKeys = new Set(Object.keys(map))

  const missingInCommitted = [...derivedKeys].filter((k) => !committedKeys.has(k))
  const extraInCommitted = [...committedKeys].filter((k) => !derivedKeys.has(k))

  let driftErrors = 0

  if (missingInCommitted.length > 0) {
    console.error(`${String(missingInCommitted.length)} key(s) in derived but missing from upgrades.json:`)
    for (const k of missingInCommitted.slice(0, 10)) console.error(`  + ${k}`)
    if (missingInCommitted.length > 10) console.error(`  ... and ${String(missingInCommitted.length - 10)} more`)
    driftErrors += missingInCommitted.length
  }

  if (extraInCommitted.length > 0) {
    console.error(`${String(extraInCommitted.length)} key(s) in upgrades.json but not in derived:`)
    for (const k of extraInCommitted.slice(0, 10)) console.error(`  - ${k}`)
    if (extraInCommitted.length > 10) console.error(`  ... and ${String(extraInCommitted.length - 10)} more`)
    driftErrors += extraInCommitted.length
  }

  // Check value differences
  let valueDiffs = 0
  for (const k of derivedKeys) {
    if (!committedKeys.has(k)) continue
    const d = derived[k]
    const c = map[k]
    if (d.safe !== c.safe || d.major !== c.major) {
      if (valueDiffs < 5) {
        console.error(`  "${k}": derived=${JSON.stringify(d)} committed=${JSON.stringify(c)}`)
      }
      valueDiffs++
    }
  }
  if (valueDiffs > 0) {
    console.error(`${String(valueDiffs)} value difference(s) between derived and committed`)
    if (valueDiffs > 5) console.error(`  ... (showing first 5)`)
    driftErrors += valueDiffs
  }

  if (driftErrors > 0) {
    console.error('\nFamilies derivation does NOT match committed upgrades.json.')
    console.error('Run `pnpm discover` to regenerate upgrades.json from families.json.')
    process.exit(1)
  }

  console.log('Families derivation matches committed upgrades.json.')
  console.log('All checks passed.')
}

main()
