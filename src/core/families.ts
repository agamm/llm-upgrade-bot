import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { Result } from './types.js'

export type FamilyChain = string[][] // outer = generations, inner = safe group
export type FamiliesMap = Record<string, FamilyChain>

/** Load families.json from disk. Returns Result<FamiliesMap>. */
export function loadFamilies(customPath?: string): Result<FamiliesMap> {
  const filePath = customPath ?? join(import.meta.dirname, '../../data/families.json')
  try {
    const raw = readFileSync(filePath, 'utf-8')
    const parsed = JSON.parse(raw) as FamiliesMap
    return { ok: true, data: parsed }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, error: `Failed to load families.json: ${message}` }
  }
}

/** Collect all model IDs across all lineages into a Set. */
export function allModelsInFamilies(families: FamiliesMap): Set<string> {
  const models = new Set<string>()
  for (const chain of Object.values(families)) {
    for (const generation of chain) {
      for (const modelId of generation) {
        models.add(modelId)
      }
    }
  }
  return models
}

/** Find which lineage a model belongs to and its position. Returns null if not found. */
export function findModelInFamilies(
  families: FamiliesMap,
  modelId: string,
): { lineageKey: string; genIndex: number; posIndex: number } | null {
  for (const [lineageKey, chain] of Object.entries(families)) {
    for (let genIndex = 0; genIndex < chain.length; genIndex++) {
      const generation = chain[genIndex] ?? []
      for (let posIndex = 0; posIndex < generation.length; posIndex++) {
        if (generation[posIndex] === modelId) {
          return { lineageKey, genIndex, posIndex }
        }
      }
    }
  }
  return null
}
