import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { UpgradeMap } from '../../src/core/types.js'

export const UPGRADES_PATH = join(
  import.meta.dirname,
  '..',
  '..',
  'data',
  'upgrades.json',
)

export async function loadRealMap(): Promise<UpgradeMap> {
  const raw = await readFile(UPGRADES_PATH, 'utf-8')
  return JSON.parse(raw) as UpgradeMap
}
