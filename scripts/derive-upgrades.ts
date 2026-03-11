import { writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { loadFamilies } from '../src/core/families.js'
import { deriveUpgradeMap } from '../src/core/derive-upgrades.js'

const DATA_DIR = join(import.meta.dirname, '..', 'data')

const familiesResult = loadFamilies(join(DATA_DIR, 'families.json'))
if (!familiesResult.ok) {
  console.error(familiesResult.error)
  process.exit(1)
}

const upgradeMap = deriveUpgradeMap(familiesResult.data)
await writeFile(join(DATA_DIR, 'upgrades.json'), JSON.stringify(upgradeMap) + '\n', 'utf-8')
console.log(`Wrote ${String(Object.keys(upgradeMap).length)} entries to upgrades.json`)
