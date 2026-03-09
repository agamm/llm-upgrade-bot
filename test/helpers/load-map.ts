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
  const parsed = JSON.parse(raw) as Record<string, unknown>
  delete parsed['_pinned']
  return parsed as UpgradeMap
}
