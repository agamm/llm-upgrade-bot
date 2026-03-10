import { describe, it, expect } from 'vitest'
import type { UpgradeMap, VariantRule } from '../../src/core/types.js'
import {
  checkVariantConsistency,
  checkCrossTierUpgrades,
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

  it('catches prefixed variants too', () => {
    const map: UpgradeMap = {
      'openai/gpt-5-mini': { safe: null, major: 'openai/gpt-5.4' },
    }
    const errors = checkCrossTierUpgrades(map)
    expect(errors).toHaveLength(1)
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
