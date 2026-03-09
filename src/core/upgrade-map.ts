import { readFile } from 'node:fs/promises'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { UpgradeEntry, UpgradeMap, Result } from './types.js'

function resolveDefaultPaths(): string[] {
  const dir =
    typeof __dirname !== 'undefined'
      ? __dirname
      : dirname(fileURLToPath(import.meta.url))
  // src/core/ → ../../data, dist/ → ../data
  return [
    join(dir, '..', '..', 'data', 'upgrades.json'),
    join(dir, '..', 'data', 'upgrades.json'),
  ]
}

const DEFAULT_UPGRADE_PATHS = resolveDefaultPaths()

interface LoadOptions {
  url?: string
  fallbackPath?: string
}

function parseUpgradeMap(text: string): Result<UpgradeMap> {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch {
    return { ok: false, error: 'Failed to parse JSON: invalid syntax' }
  }

  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: 'Failed to parse JSON: expected an object' }
  }

  const data = parsed as Record<string, unknown>
  delete data['_pinned']
  return { ok: true, data: data as UpgradeMap }
}

async function loadFromFile(path: string): Promise<Result<UpgradeMap>> {
  let text: string
  try {
    text = await readFile(path, 'utf-8')
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown file read error'
    return { ok: false, error: `Failed to read file: ${message}` }
  }
  return parseUpgradeMap(text)
}

async function loadFromUrl(url: string): Promise<Result<UpgradeMap>> {
  let response: Response
  try {
    response = await fetch(url)
  } catch (err) {
    const message =
      err instanceof Error ? err.message : 'Unknown fetch error'
    return { ok: false, error: `Failed to fetch URL: ${message}` }
  }

  if (!response.ok) {
    return {
      ok: false,
      error: `Failed to fetch URL: HTTP ${String(response.status)}`,
    }
  }

  const text = await response.text()
  return parseUpgradeMap(text)
}

async function loadFromPaths(
  paths: string[],
): Promise<Result<UpgradeMap>> {
  let lastError = 'No fallback paths configured'
  for (const path of paths) {
    const result = await loadFromFile(path)
    if (result.ok) return result
    lastError = result.error
  }
  return { ok: false, error: lastError }
}

export async function loadUpgradeMap(
  options?: LoadOptions,
): Promise<Result<UpgradeMap>> {
  const fallbackPaths = options?.fallbackPath
    ? [options.fallbackPath]
    : DEFAULT_UPGRADE_PATHS
  const url = options?.url

  if (url) {
    const result = await loadFromUrl(url)
    if (result.ok) return result
    return loadFromPaths(fallbackPaths)
  }

  return loadFromPaths(fallbackPaths)
}

export function lookupModel(
  map: UpgradeMap,
  modelId: string,
): UpgradeEntry | undefined {
  return map[modelId]
}
