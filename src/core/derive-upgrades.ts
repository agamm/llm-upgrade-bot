import type { UpgradeMap, UpgradeEntry } from './types.js'
import type { FamiliesMap } from './families.js'

/** Prefix config: maps lineage key patterns to OpenRouter-style prefixes to auto-generate. */
export const PREFIX_RULES: { pattern: RegExp; prefixes: string[] }[] = [
  { pattern: /^openai-/, prefixes: ['openai/'] },
  { pattern: /^anthropic-/, prefixes: ['anthropic/'] },
  { pattern: /^google-|^gemini-/, prefixes: ['google/', 'gemini/'] },
  { pattern: /^mistral-/, prefixes: ['mistralai/'] },
  { pattern: /^deepseek/, prefixes: ['deepseek/'] },
  { pattern: /^xai-/, prefixes: ['x-ai/'] },
  { pattern: /^kimi/, prefixes: ['moonshotai/'] },
  { pattern: /^qwen/, prefixes: ['qwen/'] },
  { pattern: /^llama-|^meta-llama/, prefixes: ['meta-llama/'] },
]

/** Check if a sequence like "4.6" or "3.5.1" has only 1-2 digit components */
function isVersionSequence(seq: string, sep: string): boolean {
  return seq.split(sep).every(p => p.length <= 2)
}

/** Generate the hyphen variant of a dot-canonical model ID */
function toHyphenVariant(id: string): string | null {
  const replaced = id.replace(/\d+(?:\.(?!\d+[bBkK])\d+)+/g, m =>
    isVersionSequence(m, '.') ? m.replaceAll('.', '-') : m,
  )
  return replaced !== id ? replaced : null
}

/** Convert targets to use the same separator style */
function convertTargetSeparators(target: string, useHyphens: boolean): string {
  if (useHyphens) {
    return target.replace(/\d+(?:\.(?!\d+[bBkK])\d+)+/g, m =>
      isVersionSequence(m, '.') ? m.replaceAll('.', '-') : m,
    )
  }
  return target
}

/** Convert an UpgradeEntry's targets to hyphen separator style */
function convertEntrySeparators(entry: UpgradeEntry): UpgradeEntry {
  return {
    safe: entry.safe ? convertTargetSeparators(entry.safe, true) : null,
    major: entry.major ? convertTargetSeparators(entry.major, true) : null,
  }
}

/** Compute safe/major for a single model given its position in the lineage. */
function computeEntry(
  chain: string[][],
  genIndex: number,
  posIndex: number,
): UpgradeEntry {
  const generation = chain[genIndex] ?? []
  const lastGen = chain[chain.length - 1] ?? []
  const ultimate = lastGen[lastGen.length - 1] ?? ''
  const lastInGen = generation[generation.length - 1] ?? ''
  const isLastInGen = posIndex === generation.length - 1
  const isLastGen = genIndex === chain.length - 1

  const safe: string | null = isLastInGen ? null : lastInGen
  const major: string | null = isLastGen && isLastInGen ? null : ultimate
  return { safe, major: major === safe ? null : major }
}

/** Add separator variants for all entries in the map, mutating it. */
function addSeparatorVariants(map: UpgradeMap): void {
  const baseKeys = Object.keys(map)
  for (const key of baseKeys) {
    const hyphenKey = toHyphenVariant(key)
    if (hyphenKey && !(hyphenKey in map)) {
      const entry = map[key]
      if (entry) map[hyphenKey] = convertEntrySeparators(entry)
    }
  }
}

/** Find matching prefixes for a lineage key. */
function matchingPrefixes(lineageKey: string): string[] {
  for (const rule of PREFIX_RULES) {
    if (rule.pattern.test(lineageKey)) return rule.prefixes
  }
  return []
}

/** Add prefixed variants for native lineages, mutating the map. */
function addPrefixVariants(
  map: UpgradeMap,
  families: FamiliesMap,
): void {
  for (const [lineageKey, chain] of Object.entries(families)) {
    const prefixes = matchingPrefixes(lineageKey)
    if (prefixes.length === 0) continue

    for (const generation of chain) {
      for (const modelId of generation) {
        const entry = map[modelId]
        if (!entry) continue

        for (const prefix of prefixes) {
          const prefixedKey = prefix + modelId
          if (prefixedKey in map) continue
          map[prefixedKey] = {
            safe: entry.safe ? prefix + entry.safe : null,
            major: entry.major ? prefix + entry.major : null,
          }
        }
      }
    }
  }
}

/** Derive a complete UpgradeMap from families data. Pure, no I/O. */
export function deriveUpgradeMap(families: FamiliesMap): UpgradeMap {
  const map: UpgradeMap = {}

  // 1. Base entries
  for (const chain of Object.values(families)) {
    for (let gi = 0; gi < chain.length; gi++) {
      const gen = chain[gi] ?? []
      for (let pi = 0; pi < gen.length; pi++) {
        const modelId = gen[pi]
        if (modelId) map[modelId] = computeEntry(chain, gi, pi)
      }
    }
  }

  // 2. Separator variants for base entries
  addSeparatorVariants(map)

  // 3. Prefix variants for native lineages
  addPrefixVariants(map, families)

  // 4. Separator variants for prefix entries
  addSeparatorVariants(map)

  return map
}
