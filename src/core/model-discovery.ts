import type { ProviderConfig, Result } from './types.js'

const NON_CHAT_PATTERN =
  /embed|rerank|tts|whisper|dall-e|image|moderat|guard|diffusion|flux|veo|imagen|safety|jamba-1\.5|transcribe/i

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
