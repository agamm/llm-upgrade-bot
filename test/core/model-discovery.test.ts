import { describe, it, expect } from 'vitest'
import type { UpgradeMap } from '../../src/core/types.js'
import {
  filterChatModels,
  diffModels,
  detectSafeUpgrades,
  suggestMajorUpgrades,
  generateReport,
} from '../../src/core/model-discovery.js'

describe('filterChatModels', () => {
  it('keeps chat models', () => {
    const ids = ['gpt-4o', 'claude-3-opus', 'gemini-2.5-pro']
    expect(filterChatModels(ids)).toEqual(ids)
  })

  it('filters out non-chat models', () => {
    const ids = [
      'gpt-4o',
      'text-embedding-3-small',
      'whisper-1',
      'dall-e-3',
      'tts-1',
      'llama-guard-3',
      'stable-diffusion-xl',
      'flux-pro',
    ]
    expect(filterChatModels(ids)).toEqual(['gpt-4o'])
  })
})

describe('diffModels', () => {
  it('returns only new models', () => {
    const known = new Set(['gpt-4o', 'claude-3-opus'])
    const discovered = ['gpt-4o', 'claude-3-opus', 'gpt-5']
    expect(diffModels(known, discovered)).toEqual(['gpt-5'])
  })

  it('returns empty when no new models', () => {
    const known = new Set(['gpt-4o'])
    expect(diffModels(known, ['gpt-4o'])).toEqual([])
  })
})

describe('detectSafeUpgrades', () => {
  it('detects safe upgrade for same family with newer date', () => {
    const map: UpgradeMap = {
      'claude-3-5-sonnet-20240620': { safe: null, major: 'claude-sonnet-4-6' },
    }
    const newIds = ['claude-3-5-sonnet-20241022']
    const proposed = detectSafeUpgrades(newIds, map)
    expect(proposed).toHaveLength(1)
    const first = proposed[0]
    expect(first?.key).toBe('claude-3-5-sonnet-20240620')
    expect(first?.entry.safe).toBe('claude-3-5-sonnet-20241022')
    expect(first?.confidence).toBe('auto')
  })

  it('does not propose safe upgrade for older date', () => {
    const map: UpgradeMap = {
      'gpt-4o-2024-11-20': { safe: null, major: 'gpt-4.1' },
    }
    const newIds = ['gpt-4o-2024-05-13']
    expect(detectSafeUpgrades(newIds, map)).toEqual([])
  })

  it('skips entries that already have safe upgrade', () => {
    const map: UpgradeMap = {
      'gpt-4o-2024-05-13': { safe: 'gpt-4o-2024-08-06', major: null },
    }
    const newIds = ['gpt-4o-2024-11-20']
    expect(detectSafeUpgrades(newIds, map)).toEqual([])
  })
})

describe('suggestMajorUpgrades', () => {
  it('suggests major upgrade for higher version in same line', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: null },
    }
    const newIds = ['gpt-5']
    const proposed = suggestMajorUpgrades(newIds, map)
    expect(proposed).toHaveLength(1)
    const first = proposed[0]
    expect(first?.key).toBe('gpt-4')
    expect(first?.entry.major).toBe('gpt-5')
    expect(first?.confidence).toBe('suggested')
  })

  it('refreshes major target when higher version discovered in same line', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-5' },
    }
    const newIds = ['gpt-6']
    const proposed = suggestMajorUpgrades(newIds, map)
    expect(proposed).toHaveLength(1)
    const first = proposed[0]
    expect(first?.key).toBe('gpt-4')
    expect(first?.entry.major).toBe('gpt-6')
  })

  it('does not refresh major when new version is lower than current target', () => {
    const map: UpgradeMap = {
      'gpt-3': { safe: null, major: 'gpt-5' },
    }
    const newIds = ['gpt-4']
    expect(suggestMajorUpgrades(newIds, map)).toEqual([])
  })

  it('does not cross suffix tiers when refreshing major', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-5' },
    }
    const newIds = ['gpt-6-mini']
    expect(suggestMajorUpgrades(newIds, map)).toEqual([])
  })

  it('matches fuzzy suffixes: gemini-2.0-flash → gemini-3-flash-preview', () => {
    const map: UpgradeMap = {
      'gemini-2.0-flash': { safe: null, major: null },
    }
    const newIds = ['gemini-3-flash-preview']
    const proposed = suggestMajorUpgrades(newIds, map)
    expect(proposed).toHaveLength(1)
    expect(proposed[0]?.entry.major).toBe('gemini-3-flash-preview')
  })

  it('does not match across different tiers: flash vs flash-lite', () => {
    const map: UpgradeMap = {
      'gemini-2.0-flash': { safe: null, major: null },
    }
    const newIds = ['gemini-3-flash-lite-preview']
    expect(suggestMajorUpgrades(newIds, map)).toEqual([])
  })

  it('matches flagship tiers: gpt-4o → gpt-5.4 (both tier "")', () => {
    const map: UpgradeMap = {
      'gpt-4o': { safe: null, major: null },
    }
    const newIds = ['gpt-5.4']
    const proposed = suggestMajorUpgrades(newIds, map)
    expect(proposed).toHaveLength(1)
    expect(proposed[0]?.entry.major).toBe('gpt-5.4')
  })
})

describe('generateReport', () => {
  it('generates markdown with proposed entries', () => {
    const proposed = [
      {
        key: 'gpt-4o-2024-05-13',
        entry: { safe: 'gpt-4o-2024-11-20', major: null },
        confidence: 'auto' as const,
        reason: 'newer date',
        sources: ['OpenAI'],
      },
    ]
    const report = generateReport(proposed, [])
    expect(report).toContain('gpt-4o-2024-05-13')
    expect(report).toContain('1 proposed')
  })

  it('includes skipped providers', () => {
    const report = generateReport([], ['OpenAI: Missing key'])
    expect(report).toContain('Skipped Providers')
    expect(report).toContain('OpenAI')
  })

  it('handles empty results', () => {
    const report = generateReport([], [])
    expect(report).toContain('No new upgrade paths')
  })
})
