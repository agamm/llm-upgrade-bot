import { describe, it, expect, vi, afterEach, beforeEach } from 'vitest'
import { writeFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { loadUpgradeMap, lookupModel } from '../../src/core/upgrade-map.js'
import type { UpgradeMap } from '../../src/core/types.js'
import { loadRealMap, UPGRADES_PATH } from '../helpers/load-map.js'

describe('loadUpgradeMap', () => {
  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('parses valid JSON file and returns ok:true with typed UpgradeMap', async () => {
    const result = await loadUpgradeMap({ fallbackPath: UPGRADES_PATH })

    expect(result.ok).toBe(true)
    if (!result.ok) return

    const map = result.data
    expect(Object.keys(map).length).toBeGreaterThan(0)

    for (const [, entry] of Object.entries(map)) {
      expect(entry).toHaveProperty('safe')
      expect(entry).toHaveProperty('major')
      expect(
        entry.safe === null || typeof entry.safe === 'string',
      ).toBe(true)
      expect(
        entry.major === null || typeof entry.major === 'string',
      ).toBe(true)
      expect(entry.safe !== null || entry.major !== null).toBe(true)
    }
  })

  it('rejects malformed JSON and returns ok:false', async () => {
    let tempDir: string | undefined
    try {
      tempDir = await mkdtemp(join(tmpdir(), 'upgrade-map-test-'))
      const badFile = join(tempDir, 'bad.json')
      await writeFile(badFile, '{ not valid json!!!', 'utf-8')

      const result = await loadUpgradeMap({ fallbackPath: badFile })

      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.error).toMatch(/parse|json|syntax/i)
      }
    } finally {
      if (tempDir) await rm(tempDir, { recursive: true })
    }
  })

  it('handles missing file gracefully and returns ok:false', async () => {
    const result = await loadUpgradeMap({
      fallbackPath: '/nonexistent/path/upgrades.json',
    })

    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toBeTruthy()
    }
  })

  it('fetches from URL when provided', async () => {
    const fakeMap: UpgradeMap = {
      'test-model': { safe: 'test-model-v2', major: null },
    }

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve(JSON.stringify(fakeMap)),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/upgrades.json')
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.data['test-model']).toEqual({
        safe: 'test-model-v2',
        major: null,
      })
    }
  })

  it('falls back to bundled file when URL fetch fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockRejectedValue(new Error('network error')),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(fetch).toHaveBeenCalledWith('https://example.com/upgrades.json')
    expect(result.ok).toBe(true)
    if (result.ok) {
      // Verify it loaded from the bundled file (has real entries)
      expect(Object.keys(result.data).length).toBeGreaterThan(10)
      expect(result.data['gpt-4']).toBeDefined()
    }
  })

  it('falls back to bundled file when URL returns non-ok response', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        text: () => Promise.resolve('Not Found'),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: UPGRADES_PATH,
    })

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.data).length).toBeGreaterThan(10)
    }
  })

  it('returns ok:false when URL returns invalid JSON and fallback also fails', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        text: () => Promise.resolve('not json'),
      }),
    )

    const result = await loadUpgradeMap({
      url: 'https://example.com/upgrades.json',
      fallbackPath: '/nonexistent/path/upgrades.json',
    })

    expect(result.ok).toBe(false)
  })

  it('loads from default fallback path when no options provided', async () => {
    const result = await loadUpgradeMap()

    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(Object.keys(result.data).length).toBeGreaterThan(10)
    }
  })
})

describe('lookupModel', () => {
  let map: UpgradeMap

  beforeEach(async () => {
    map = await loadRealMap()
  })

  it('returns an UpgradeEntry for a known model', () => {
    const entry = lookupModel(map, 'gpt-4')
    expect(entry).toBeDefined()
    expect(entry).toHaveProperty('safe')
    expect(entry).toHaveProperty('major')
  })

  it('returns entry with at least one upgrade path', () => {
    for (const key of Object.keys(map)) {
      const entry = lookupModel(map, key)
      expect(entry).toBeDefined()
      expect(entry?.safe !== null || entry?.major !== null).toBe(true)
    }
  })

  it('returns correct entry for platform-variant model', () => {
    const orKey = Object.keys(map).find((k) => k.includes('/'))
    expect(orKey).toBeDefined()
    const entry = lookupModel(map, orKey as string)
    expect(entry).toBeDefined()
  })

  it('returns undefined for unknown model', () => {
    expect(lookupModel(map, 'nonexistent-model-xyz')).toBeUndefined()
  })

  it('returns undefined for empty string', () => {
    expect(lookupModel(map, '')).toBeUndefined()
  })
})
