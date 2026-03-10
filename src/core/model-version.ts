export interface ModelVersion {
  line: string
  version: number[]
  suffix: string
  tier: string
  paramSize?: string    // e.g. "72b", "235b"
  contextSize?: string  // e.g. "32k", "128k"
  quantization?: string // e.g. "fp8", "fp16", "int4"
}

/** Suffix words that don't affect capability tier (release stages, naming conventions). */
const NOISE_TOKENS = new Set(['preview', 'latest', 'exp', 'experimental', 'beta', 'o'])

const PARAM_SIZE_RE = /^\d+[Bb]$/
const MOE_ACTIVE_RE = /^[Aa]\d+[Bb]$/
const CONTEXT_SIZE_RE = /^\d+[Kk]$/
const FLOAT_QUANT_RE = /^[Ff][Pp]\d+$/
const INT_QUANT_RE = /^[Ii][Nn][Tt]\d+$/
const GGUF_QUANT_RE = /^[Qq]\d+.*$/

interface ModelAttributes {
  tier: string
  paramSize?: string
  contextSize?: string
  quantization?: string
}

/** Extract semantic model attributes from suffix tokens, returning a clean tier string. */
export function extractModelAttributes(suffix: string): ModelAttributes {
  let paramSize: string | undefined
  let contextSize: string | undefined
  let quantization: string | undefined
  const tierTokens: string[] = []

  for (const t of suffix.split('-')) {
    if (t === '') continue
    const lower = t.toLowerCase()
    if (NOISE_TOKENS.has(lower) || /^\d+$/.test(t)) continue
    if (PARAM_SIZE_RE.test(t)) {
      paramSize = lower
    } else if (MOE_ACTIVE_RE.test(t)) {
      // MoE active params (e.g. A22B) — strip from tier, don't store
    } else if (CONTEXT_SIZE_RE.test(t)) {
      contextSize = lower
    } else if (FLOAT_QUANT_RE.test(t) || INT_QUANT_RE.test(t) || GGUF_QUANT_RE.test(t)) {
      quantization = lower
    } else {
      tierTokens.push(lower)
    }
  }

  return {
    tier: tierTokens.sort().join('-'),
    ...(paramSize !== undefined && { paramSize }),
    ...(contextSize !== undefined && { contextSize }),
    ...(quantization !== undefined && { quantization }),
  }
}

/** Extract tier identity from suffix. Strips NOISE_TOKENS, numeric components,
 *  and semantic attributes (param size, context size, quantization). */
export function tierOf(suffix: string): string {
  return extractModelAttributes(suffix).tier
}

const VERSION_PATTERN = /^(.+?)[-_]?v?(\d+(?:\.\d+)*)(.*)$/

export function parseModelVersion(id: string): ModelVersion | null {
  const match = VERSION_PATTERN.exec(id)
  if (!match) return null
  const [, line = '', versionStr = '', suffix = ''] = match
  const version = versionStr.split('.').map(Number)
  if (version.some(isNaN)) return null
  const attrs = extractModelAttributes(suffix)
  return { line, version, suffix, ...attrs }
}

/** Version components are 1–2 digits. 3+ digit components are date/build codes (e.g., 0905). */
function isVersionSequence(seq: string, sep: string): boolean {
  return seq.split(sep).every((p) => p.length <= 2)
}

/** Normalize digit-hyphen-digit to digit-dot-digit so 4-6 and 4.6 compare equal.
 *  Only normalizes sequences where every component is 1–2 digits.
 *  Negative lookahead prevents absorbing param/context sizes (e.g. 72b, 32k). */
export function normalizeVersionSeparators(id: string): string {
  return id.replace(/\d+(?:-(?!\d+[bBkK])\d+)+/g, (m) => (isVersionSequence(m, '-') ? m.replaceAll('-', '.') : m))
}

/** Convert newId digit separators to match the convention used in referenceId */
export function matchSeparatorStyle(newId: string, referenceId: string): string {
  const refUsesHyphen = /\d-\d/.test(referenceId)
  const refUsesDot = /\d\.\d/.test(referenceId)

  if (refUsesHyphen && !refUsesDot) {
    return newId.replace(/\d+(?:\.(?!\d+[bBkK])\d+)+/g, (m) => (isVersionSequence(m, '.') ? m.replaceAll('.', '-') : m))
  }
  if (refUsesDot && !refUsesHyphen) {
    return newId.replace(/\d+(?:-(?!\d+[bBkK])\d+)+/g, (m) => (isVersionSequence(m, '-') ? m.replaceAll('-', '.') : m))
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
