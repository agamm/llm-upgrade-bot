import { describe, it, expect } from 'vitest'
import type { UpgradeMap, VariantRule } from '../../src/core/types.js'
import {
  checkVariantConsistency,
  checkCrossTierUpgrades,
  syncVariantConsistency,
  validateUpgradeMap,
  OPENROUTER_RULE,
} from '../../src/core/variant-validator.js'

describe('checkVariantConsistency', () => {
  const rules: VariantRule[] = [OPENROUTER_RULE]

  it('returns empty when variants match native', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-5' },
      'openai/gpt-4': { safe: null, major: 'openai/gpt-5' },
    }
    const errors = checkVariantConsistency(map, rules)
    expect(errors).toEqual([])
  })

  it('detects when variant has upgrade but native does not', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: null },
      'openai/gpt-4': { safe: null, major: 'openai/gpt-5' },
    }
    const errors = checkVariantConsistency(map, rules)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('major')
  })

  it('detects when native has upgrade but variant does not', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: 'gpt-4-new', major: null },
      'openai/gpt-4': { safe: null, major: null },
    }
    const errors = checkVariantConsistency(map, rules)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('safe')
  })

  it('skips variants without matching native entry', () => {
    const map: UpgradeMap = {
      'openai/gpt-4': { safe: null, major: 'openai/gpt-5' },
    }
    const errors = checkVariantConsistency(map, rules)
    expect(errors).toEqual([])
  })
})

describe('checkCrossTierUpgrades', () => {
  it('flags mini upgrading to flagship', () => {
    const map: UpgradeMap = {
      'gpt-5-mini': { safe: null, major: 'gpt-5.4' },
    }
    const errors = checkCrossTierUpgrades(map)
    expect(errors).toHaveLength(1)
    expect(errors[0]).toContain('mini')
    expect(errors[0]).toContain('flagship')
  })

  it('flags nano upgrading to flagship', () => {
    const map: UpgradeMap = {
      'gpt-5-nano': { safe: null, major: 'gpt-6' },
    }
    const errors = checkCrossTierUpgrades(map)
    expect(errors).toHaveLength(1)
  })

  it('allows mini upgrading to mini', () => {
    const map: UpgradeMap = {
      'gpt-4o-mini': { safe: null, major: 'gpt-5-mini' },
    }
    expect(checkCrossTierUpgrades(map)).toEqual([])
  })

  it('allows flagship upgrading to flagship', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-5.4' },
    }
    expect(checkCrossTierUpgrades(map)).toEqual([])
  })

  it('allows cross-line upgrades (naming convention changes)', () => {
    const map: UpgradeMap = {
      'claude-3-sonnet-20240229': { safe: null, major: 'claude-sonnet-4-6' },
    }
    expect(checkCrossTierUpgrades(map)).toEqual([])
  })

  it('catches prefixed variants too', () => {
    const map: UpgradeMap = {
      'openai/gpt-5-mini': { safe: null, major: 'openai/gpt-5.4' },
    }
    const errors = checkCrossTierUpgrades(map)
    expect(errors).toHaveLength(1)
  })
})

describe('syncVariantConsistency', () => {
  it('propagates major from variant to native', () => {
    const map: UpgradeMap = {
      'claude-haiku-4-5-20251001': { safe: null, major: null },
      'anthropic/claude-haiku-4-5-20251001': { safe: null, major: 'anthropic/claude-haiku-4-5' },
    }
    const synced = syncVariantConsistency(map, new Set(['anthropic/claude-haiku-4-5-20251001']))
    expect(synced).toBe(1)
    expect(map['claude-haiku-4-5-20251001']!.major).toBe('claude-haiku-4-5')
  })

  it('propagates safe from native to variant', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: 'gpt-4-new', major: null },
      'openai/gpt-4': { safe: null, major: null },
    }
    const synced = syncVariantConsistency(map, new Set(['gpt-4']))
    expect(synced).toBe(1)
    expect(map['openai/gpt-4']!.safe).toBe('openai/gpt-4-new')
  })

  it('does not overwrite existing values', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: 'gpt-4a', major: null },
      'openai/gpt-4': { safe: 'openai/gpt-4b', major: null },
    }
    const synced = syncVariantConsistency(map, new Set(['gpt-4']))
    expect(synced).toBe(0)
    expect(map['openai/gpt-4']!.safe).toBe('openai/gpt-4b')
  })
})

describe('validateUpgradeMap', () => {
  it('returns ok for valid map', () => {
    const map: UpgradeMap = {
      'model-a': { safe: null, major: 'model-b' },
      'model-b': { safe: null, major: null },
    }
    const result = validateUpgradeMap(map)
    expect(result.ok).toBe(true)
  })

  it('returns errors for inconsistent variants', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: null },
      'openai/gpt-4': { safe: null, major: 'openai/gpt-5' },
    }
    const result = validateUpgradeMap(map)
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error.length).toBeGreaterThan(0)
    }
  })
})
