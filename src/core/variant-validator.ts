import type { UpgradeMap, VariantRule, Result } from './types.js'

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

export function validateUpgradeMap(
  map: UpgradeMap,
  rules: VariantRule[] = [OPENROUTER_RULE],
): Result<void, string[]> {
  const errors = checkVariantConsistency(map, rules)

  if (errors.length > 0) {
    return { ok: false, error: errors }
  }
  return { ok: true, data: undefined }
}
