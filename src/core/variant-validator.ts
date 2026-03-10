import type { UpgradeMap, VariantRule, Result } from './types.js'
import { parseModelVersion, normalizeVersionSeparators } from './model-version.js'

export function checkVariantConsistency(
  map: UpgradeMap,
  rules: VariantRule[],
): string[] {
  const errors: string[] = []

  for (const [variantKey, entry] of Object.entries(map)) {
    for (const rule of rules) {
      if (!rule.pattern.test(variantKey)) continue

      const nativeId = rule.extractNative(variantKey)
      if (!nativeId || !map[nativeId]) continue

      const nativeEntry = map[nativeId]

      // Check that safe/major targets are consistent (both null, or variant target maps to native target)
      for (const field of ['safe', 'major'] as const) {
        const variantTarget = entry[field]
        const nativeTarget = nativeEntry[field]

        if (nativeTarget === null && variantTarget !== null) {
          errors.push(
            `${rule.name}: "${variantKey}".${field} is "${variantTarget}" but native "${nativeId}".${field} is null`,
          )
        }
        if (nativeTarget !== null && variantTarget === null) {
          errors.push(
            `${rule.name}: "${variantKey}".${field} is null but native "${nativeId}".${field} is "${nativeTarget}"`,
          )
        }
      }
    }
  }

  return errors
}

export const OPENROUTER_RULE: VariantRule = {
  name: 'OpenRouter',
  pattern: /^[a-z-]+\//,
  extractNative: (key) => {
    const slash = key.indexOf('/')
    return slash > 0 ? key.slice(slash + 1) : null
  },
}

const SIZE_TIERS = new Set(['mini', 'nano', 'micro'])

function stripPrefix(id: string): string {
  const slash = id.indexOf('/')
  return slash > 0 ? id.slice(slash + 1) : id
}

/** Catch size-tier models (mini/nano) upgrading to flagship or vice versa within the same line. */
export function checkCrossTierUpgrades(map: UpgradeMap): string[] {
  const errors: string[] = []
  const norm = normalizeVersionSeparators

  for (const [key, entry] of Object.entries(map)) {
    const keyParsed = parseModelVersion(norm(stripPrefix(key)))
    if (!keyParsed) continue

    for (const field of ['safe', 'major'] as const) {
      const target = entry[field]
      if (!target) continue
      const targetParsed = parseModelVersion(norm(stripPrefix(target)))
      if (!targetParsed) continue
      if (keyParsed.line !== targetParsed.line) continue

      const keyIsSize = SIZE_TIERS.has(keyParsed.tier)
      const targetIsSize = SIZE_TIERS.has(targetParsed.tier)

      if (keyIsSize && !targetIsSize && targetParsed.tier === '') {
        errors.push(`"${key}".${field} → "${target}": size tier "${keyParsed.tier}" upgrades to flagship`)
      }
      if (!keyIsSize && keyParsed.tier === '' && targetIsSize) {
        errors.push(`"${key}".${field} → "${target}": flagship downgrades to size tier "${targetParsed.tier}"`)
      }
    }
  }

  return errors
}

/** Propagate safe/major from updated keys to their variant/native counterparts. */
export function syncVariantConsistency(
  map: UpgradeMap,
  updatedKeys: Set<string>,
  rules: VariantRule[] = [OPENROUTER_RULE],
): number {
  let synced = 0
  for (const key of updatedKeys) {
    for (const rule of rules) {
      if (rule.pattern.test(key)) {
        // Variant key updated — propagate to native
        const nativeKey = rule.extractNative(key)
        if (!nativeKey || !map[nativeKey]) continue
        const prefix = key.slice(0, key.length - nativeKey.length)
        const variantEntry = map[key]!
        const nativeEntry = map[nativeKey]
        for (const field of ['safe', 'major'] as const) {
          if (variantEntry[field] !== null && nativeEntry[field] === null) {
            nativeEntry[field] = variantEntry[field]!.replace(prefix, '')
            synced++
          }
        }
      } else {
        // Native key — propagate to matching variants
        for (const [vKey, vEntry] of Object.entries(map)) {
          if (!rule.pattern.test(vKey)) continue
          const nativeId = rule.extractNative(vKey)
          if (nativeId !== key) continue
          const prefix = vKey.slice(0, vKey.length - key.length)
          const nativeEntry = map[key]!
          for (const field of ['safe', 'major'] as const) {
            if (nativeEntry[field] !== null && vEntry[field] === null) {
              vEntry[field] = `${prefix}${nativeEntry[field]}`
              synced++
            }
          }
        }
      }
    }
  }
  return synced
}

export function validateUpgradeMap(
  map: UpgradeMap,
  rules: VariantRule[] = [OPENROUTER_RULE],
): Result<void, string[]> {
  const errors = [
    ...checkVariantConsistency(map, rules),
    ...checkCrossTierUpgrades(map),
  ]

  if (errors.length > 0) {
    return { ok: false, error: errors }
  }
  return { ok: true, data: undefined }
}
