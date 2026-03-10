export interface ModelVersion {
  line: string
  version: number[]
  suffix: string
  tier: string
}

const TIER_TOKENS = new Set([
  'mini', 'nano', 'micro',
  'flash', 'lite', 'turbo', 'fast',
  'pro', 'plus', 'ultra', 'max',
  'sonnet', 'haiku', 'opus',
  'instruct', 'chat', 'coder', 'codex', 'customtools',
  'large', 'medium', 'small', 'nemo',
])

export function tierOf(suffix: string): string {
  return suffix
    .split('-')
    .filter((t) => TIER_TOKENS.has(t))
    .sort()
    .join('-')
}

const VERSION_PATTERN = /^(.+?)[-_]?v?(\d+(?:\.\d+)*)(.*)$/

export function parseModelVersion(id: string): ModelVersion | null {
  const match = VERSION_PATTERN.exec(id)
  if (!match) return null
  const [, line = '', versionStr = '', suffix = ''] = match
  const version = versionStr.split('.').map(Number)
  if (version.some(isNaN)) return null
  return { line, version, suffix, tier: tierOf(suffix) }
}

/** Normalize digit-hyphen-digit to digit-dot-digit so 4-6 and 4.6 compare equal */
export function normalizeVersionSeparators(id: string): string {
  return id.replace(/\d+(?:-\d+)+/g, (m) => m.replaceAll('-', '.'))
}

/** Convert newId digit separators to match the convention used in referenceId */
export function matchSeparatorStyle(newId: string, referenceId: string): string {
  const refUsesHyphen = /\d-\d/.test(referenceId)
  const refUsesDot = /\d\.\d/.test(referenceId)

  if (refUsesHyphen && !refUsesDot) {
    return newId.replace(/\d+(?:\.\d+)+/g, (m) => m.replaceAll('.', '-'))
  }
  if (refUsesDot && !refUsesHyphen) {
    return newId.replace(/\d+(?:-\d+)+/g, (m) => m.replaceAll('-', '.'))
  }
  return newId
}

export function isHigherVersion(a: number[], b: number[]): boolean {
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0
    const bv = b[i] ?? 0
    if (av > bv) return true
    if (av < bv) return false
  }
  return false
}
