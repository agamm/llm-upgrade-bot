import type { UpgradeMap, VariantRule, Result } from './types.js'

const LATEST_MODELS_ALLOWLIST = new Set([
  // OpenAI
  'gpt-5.4', 'gpt-5.4-pro', 'gpt-5-mini', 'gpt-5-nano',
  'o3', 'o3-pro', 'o4-mini',
  'gpt-audio', 'gpt-audio-mini', 'gpt-realtime', 'gpt-realtime-mini',
  'gpt-4o-audio-preview-2025-06-03', 'gpt-4o-realtime-preview-2025-06-03',
  'gpt-4o-transcribe', 'gpt-4o-mini-tts', 'gpt-image-1.5',
  'text-embedding-3-large',
  // Anthropic
  'claude-opus-4-6', 'claude-sonnet-4-6', 'claude-haiku-4-5-20251001',
  // Google
  'gemini-2.5-pro', 'gemini-2.5-flash', 'gemini-2.5-flash-lite',
  'gemini-3.1-pro-preview', 'gemini-3-flash-preview', 'gemini-3.1-flash-lite-preview',
  'text-embedding-005', 'gemini-embedding-001',
  'imagen-4.0-generate-001',
  // Mistral
  'mistral-small-latest', 'mistral-medium-latest', 'mistral-large-latest',
  'mistral-large-2512', 'codestral-latest', 'pixtral-large-2411',
  // DeepSeek
  'deepseek-v3.2',
  // xAI
  'grok-3', 'grok-4-0709',
  // Moonshot
  'kimi-k2.5',
  // MiniMax
  'MiniMax-M2.5', 'minimax-m2-1',
  // Qwen
  'qwen3-max', 'qwen3-coder-plus',
  // Together AI targets (PascalCase)
  'meta-llama/Llama-4-Scout-17B-16E-Instruct',
  'meta-llama/Llama-4-Maverick-17B-128E-Instruct-FP8',
  'meta-llama/Llama-3.3-70B-Instruct-Turbo',
  'Qwen/Qwen3-235B-A22B-fp8',
  'deepseek-ai/DeepSeek-V3.2',
  'mistralai/Magistral-Small-2506',
  // Groq targets (lowercase)
  'meta-llama/llama-4-maverick-17b-128e-instruct',
  'meta-llama/llama-4-scout-17b-16e-instruct',
])

export function findOrphanedTargets(
  map: UpgradeMap,
  allowlist: Set<string> = LATEST_MODELS_ALLOWLIST,
): string[] {
  const keys = new Set(Object.keys(map))
  const errors: string[] = []

  for (const [key, entry] of Object.entries(map)) {
    for (const field of ['safe', 'major'] as const) {
      const target = entry[field]
      if (target === null) continue

      // Strip known prefixes to get native ID for allowlist check
      const nativeTarget = stripPrefix(target)
      if (!keys.has(target) && !keys.has(nativeTarget) && !allowlist.has(target) && !allowlist.has(nativeTarget)) {
        errors.push(`"${key}".${field} → "${target}" not found in map or allowlist`)
      }
    }
  }

  return errors
}

function stripPrefix(id: string): string {
  // OpenRouter/LiteLLM: "provider/model" → "model"
  if (id.includes('/')) return id.split('/').slice(1).join('/')
  // Bedrock: "provider.model-vN:M" → "model" (minus the version suffix)
  if (id.includes('.') && id.includes(':')) {
    return id.replace(/^[^.]+\./, '').replace(/-v\d+:\d+$/, '')
  }
  return id
}

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
  allowlist?: Set<string>,
): Result<void, string[]> {
  const orphanErrors = findOrphanedTargets(map, allowlist)
  const consistencyErrors = checkVariantConsistency(map, rules)
  const allErrors = [...orphanErrors, ...consistencyErrors]

  if (allErrors.length > 0) {
    return { ok: false, error: allErrors }
  }
  return { ok: true, data: undefined }
}
