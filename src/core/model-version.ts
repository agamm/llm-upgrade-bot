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

/** Suffix words that don't affect capability tier (release stages, naming conventions). */
const NOISE_TOKENS = new Set(['preview', 'latest', 'exp', 'experimental', 'beta', 'o'])

/** Extract tier identity from suffix. Known TIER_TOKENS and unknown capability words
 *  are included; NOISE_TOKENS (release stages) and numeric components are excluded. */
export function tierOf(suffix: string): string {
  return suffix
    .split('-')
    .filter((t) => t !== '' && !NOISE_TOKENS.has(t) && !/^\d+$/.test(t))
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

/** Version components are 1–2 digits. 3+ digit components are date/build codes (e.g., 0905). */
function isVersionSequence(seq: string, sep: string): boolean {
  return seq.split(sep).every((p) => p.length <= 2)
}

/** Normalize digit-hyphen-digit to digit-dot-digit so 4-6 and 4.6 compare equal.
 *  Only normalizes sequences where every component is 1–2 digits. */
export function normalizeVersionSeparators(id: string): string {
  return id.replace(/\d+(?:-\d+)+/g, (m) => (isVersionSequence(m, '-') ? m.replaceAll('-', '.') : m))
}

/** Convert newId digit separators to match the convention used in referenceId */
export function matchSeparatorStyle(newId: string, referenceId: string): string {
  const refUsesHyphen = /\d-\d/.test(referenceId)
  const refUsesDot = /\d\.\d/.test(referenceId)

  if (refUsesHyphen && !refUsesDot) {
    return newId.replace(/\d+(?:\.\d+)+/g, (m) => (isVersionSequence(m, '.') ? m.replaceAll('.', '-') : m))
  }
  if (refUsesDot && !refUsesHyphen) {
    return newId.replace(/\d+(?:-\d+)+/g, (m) => (isVersionSequence(m, '-') ? m.replaceAll('-', '.') : m))
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
