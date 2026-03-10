import type { UpgradeEntry, UpgradeMap, ProviderConfig, Result } from './types.js'
import { parseModelVersion, isHigherVersion, normalizeVersionSeparators, matchSeparatorStyle } from './model-version.js'

export interface ProposedEntry {
  key: string
  entry: UpgradeEntry
  confidence: 'auto' | 'suggested' | 'unknown'
  reason: string
  sources: string[]
}

const NON_CHAT_PATTERN =
  /embed|rerank|tts|whisper|dall-e|image|moderat|guard|diffusion|flux|veo|imagen|safety|jamba-1\.5/i

export const PROVIDER_CONFIGS: ProviderConfig[] = [
  {
    name: 'OpenRouter',
    url: 'https://openrouter.ai/api/v1/models',
    envVar: 'OPENROUTER_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => extractDataIds(body),
  },
  {
    name: 'OpenAI',
    url: 'https://api.openai.com/v1/models',
    envVar: 'OPENAI_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => extractDataIds(body),
  },
  {
    name: 'Anthropic',
    url: 'https://api.anthropic.com/v1/models',
    envVar: 'ANTHROPIC_API_KEY',
    authStyle: 'x-api-key',
    extractIds: (body) => extractDataIds(body),
  },
  {
    name: 'Google',
    url: 'https://generativelanguage.googleapis.com/v1beta/models',
    envVar: 'GOOGLE_API_KEY',
    authStyle: 'query-param',
    extractIds: (body) => {
      const b = body as { models?: { name?: string }[] }
      return (b.models ?? [])
        .map((m) => (m.name ?? '').replace(/^models\//, ''))
        .filter(Boolean)
    },
  },
  {
    name: 'DeepSeek',
    url: 'https://api.deepseek.com/models',
    envVar: 'DEEPSEEK_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => extractDataIds(body),
  },
  {
    name: 'xAI',
    url: 'https://api.x.ai/v1/models',
    envVar: 'XAI_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => extractDataIds(body),
  },
  {
    name: 'Together',
    url: 'https://api.together.xyz/v1/models',
    envVar: 'TOGETHER_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => {
      // Together returns a flat array, not { data: [...] }
      if (Array.isArray(body)) {
        return (body as { id?: string }[]).map((m) => m.id ?? '').filter(Boolean)
      }
      return extractDataIds(body)
    },
  },
  {
    name: 'Groq',
    url: 'https://api.groq.com/openai/v1/models',
    envVar: 'GROQ_API_KEY',
    authStyle: 'bearer',
    extractIds: (body) => extractDataIds(body),
  },
]

function extractDataIds(body: unknown): string[] {
  const b = body as { data?: { id?: string }[] }
  return (b.data ?? []).map((m) => m.id ?? '').filter(Boolean)
}

function sanitizeError(msg: string, key: string | undefined): string {
  if (!key) return msg
  return msg.replaceAll(key, '***').replaceAll(key.trim(), '***')
}

export async function fetchProviderModels(
  config: ProviderConfig,
): Promise<Result<string[]>> {
  const key = process.env[config.envVar]?.trim()

  // OpenRouter works without auth
  if (!key && config.name !== 'OpenRouter') {
    return { ok: false, error: `Missing ${config.envVar}` }
  }

  const headers: Record<string, string> = {}
  let url = config.url

  if (key) {
    if (config.authStyle === 'bearer') {
      headers['Authorization'] = `Bearer ${key}`
    } else if (config.authStyle === 'x-api-key') {
      headers['x-api-key'] = key
      headers['anthropic-version'] = '2023-06-01'
    } else if (config.authStyle === 'query-param') {
      url = `${url}?key=${key}`
    }
  }

  let response: Response
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(30_000) })
  } catch (err) {
    const raw = err instanceof Error ? err.message : 'fetch failed'
    return { ok: false, error: `${config.name}: ${sanitizeError(raw, key)}` }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `${config.name}: HTTP ${String(response.status)}`,
    }
  }

  let body: unknown
  try {
    body = await response.json()
  } catch {
    return { ok: false, error: `${config.name}: invalid JSON response` }
  }

  return { ok: true, data: config.extractIds(body) }
}

export async function fetchAllProviderModels(
  configs: ProviderConfig[] = PROVIDER_CONFIGS,
): Promise<{ models: Record<string, Set<string>>; skipped: string[] }> {
  const models: Record<string, Set<string>> = {}
  const skipped: string[] = []

  const results = await Promise.all(
    configs.map(async (c) => ({ config: c, result: await fetchProviderModels(c) })),
  )

  for (const { config, result } of results) {
    if (result.ok) {
      models[config.name] = new Set(result.data)
    } else {
      skipped.push(`${config.name}: ${result.error}`)
    }
  }

  return { models, skipped }
}

export function filterChatModels(ids: string[]): string[] {
  return ids.filter((id) => !NON_CHAT_PATTERN.test(id))
}

export function diffModels(knownKeys: Set<string>, discovered: string[]): string[] {
  return discovered.filter((id) => !knownKeys.has(id))
}

const DATE_PATTERN = /^(.+?)[-_](\d{4})[-_]?(\d{2})[-_]?(\d{2})(.*)$/

function parseModelFamily(id: string): { family: string; date: string; suffix: string } | null {
  const match = DATE_PATTERN.exec(id)
  if (!match) return null
  const [, family = '', y = '', m = '', d = '', suffix = ''] = match
  return { family, date: `${y}${m}${d}`, suffix }
}

export function detectSafeUpgrades(
  newIds: string[],
  map: UpgradeMap,
  sourceMap?: Map<string, string[]>,
): ProposedEntry[] {
  const proposed: ProposedEntry[] = []

  for (const newId of newIds) {
    const parsed = parseModelFamily(newId)
    if (!parsed) continue

    // Find existing entries in the same family with older dates
    for (const [existingKey, existingEntry] of Object.entries(map)) {
      if (existingEntry.safe !== null) continue // already has safe upgrade

      const existingParsed = parseModelFamily(existingKey)
      if (!existingParsed) continue
      if (existingParsed.family !== parsed.family) continue
      if (existingParsed.suffix !== parsed.suffix) continue
      if (existingParsed.date >= parsed.date) continue

      proposed.push({
        key: existingKey,
        entry: { safe: newId, major: existingEntry.major },
        confidence: 'auto',
        reason: `Same family "${parsed.family}", newer date ${parsed.date} > ${existingParsed.date}`,
        sources: sourceMap?.get(newId) ?? [],
      })
    }
  }

  return proposed
}


export function suggestMajorUpgrades(
  newIds: string[],
  map: UpgradeMap,
  sourceMap?: Map<string, string[]>,
): ProposedEntry[] {
  const proposed: ProposedEntry[] = []

  const norm = normalizeVersionSeparators
  for (const newId of newIds) {
    // Date-stamped models are handled by detectSafeUpgrades, not here
    if (DATE_PATTERN.test(newId)) continue
    const parsed = parseModelVersion(norm(newId))
    if (!parsed) continue

    for (const [existingKey, existingEntry] of Object.entries(map)) {
      if (existingEntry.major !== null) {
        const currentMajorParsed = parseModelVersion(norm(existingEntry.major))
        if (!currentMajorParsed) continue
        if (currentMajorParsed.line !== parsed.line) continue
        if (!isHigherVersion(parsed.version, currentMajorParsed.version)) continue
        if (currentMajorParsed.tier !== parsed.tier) continue
      }

      const existingParsed = parseModelVersion(norm(existingKey))
      if (!existingParsed) continue
      if (existingParsed.line !== parsed.line) continue
      if (existingParsed.tier !== parsed.tier) continue
      if (!isHigherVersion(parsed.version, existingParsed.version)) continue
      // Skip if version looks like a date (YYMM or YYYYMM)
      if (existingParsed.version.length === 1 && (existingParsed.version[0] ?? 0) > 1000) continue
      // Skip if proposed target is already the safe upgrade
      if (existingEntry.safe === newId) continue
      // Skip if same model with different separator (e.g., 4-6 vs 4.6)
      if (norm(newId) === norm(existingKey)) continue
      if (existingEntry.major !== null && norm(newId) === norm(existingEntry.major)) continue

      const majorId = matchSeparatorStyle(newId, existingKey)

      proposed.push({
        key: existingKey,
        entry: { safe: existingEntry.safe, major: majorId },
        confidence: 'suggested',
        reason: `Same line "${parsed.line}", higher version ${parsed.version.join('.')} > ${existingParsed.version.join('.')}`,
        sources: sourceMap?.get(newId) ?? [],
      })
    }
  }

  return proposed
}

export function generateReport(
  proposed: ProposedEntry[],
  skipped: string[],
): string {
  const lines: string[] = ['## Model Discovery Report\n']

  if (proposed.length === 0) {
    lines.push('No new upgrade paths discovered.\n')
  } else {
    lines.push(`Found ${String(proposed.length)} proposed upgrade path(s):\n`)
    lines.push('| Model | Safe | Major | Confidence | Source | Reason |')
    lines.push('|-------|------|-------|------------|--------|--------|')
    for (const p of proposed) {
      const src = p.sources.length > 0 ? p.sources.join(', ') : '-'
      lines.push(
        `| \`${p.key}\` | ${p.entry.safe ?? '-'} | ${p.entry.major ?? '-'} | ${p.confidence} | ${src} | ${p.reason} |`,
      )
    }
    lines.push('')
  }

  if (skipped.length > 0) {
    lines.push('### Skipped Providers\n')
    for (const s of skipped) {
      lines.push(`- ${s}`)
    }
    lines.push('')
  }

  return lines.join('\n')
}
