import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpgradeMap } from '../src/core/types.js'
import { validateUpgradeMap } from '../src/core/variant-validator.js'

const UPGRADES_PATH = join(import.meta.dirname, '..', 'data', 'upgrades.json')

async function main() {
  const raw = await readFile(UPGRADES_PATH, 'utf-8')
  const parsed = JSON.parse(raw) as Record<string, unknown>
  delete parsed['_pinned']
  const map = parsed as UpgradeMap

  console.log(`Validating ${String(Object.keys(map).length)} entries...`)

  const result = validateUpgradeMap(map)

  if (result.ok) {
    console.log('All checks passed.')
    process.exit(0)
  } else {
    console.error(`Found ${String(result.error.length)} issue(s):`)
    for (const err of result.error) {
      console.error(`  - ${err}`)
    }
    process.exit(1)
  }
}

main()
