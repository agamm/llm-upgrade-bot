import { describe, it, expect } from 'vitest'
import { deriveUpgradeMap, PREFIX_RULES } from '../../src/core/derive-upgrades.js'
import type { FamiliesMap } from '../../src/core/families.js'

const families: FamiliesMap = {
  'openai-flagship': [
    ['gpt-4-0613', 'gpt-4'],
    ['gpt-4o-2024-05-13', 'gpt-4o-2024-11-20', 'gpt-4o'],
    ['gpt-5.2', 'gpt-5.4'],
  ],
  'anthropic-sonnet': [
    ['claude-3-sonnet-20240229'],
    ['claude-3.5-sonnet-20240620', 'claude-3.5-sonnet-20241022'],
    ['claude-sonnet-4.6'],
  ],
}

describe('deriveUpgradeMap', () => {
  const map = deriveUpgradeMap(families)

  it('basic safe: model not last in inner array gets safe = last', () => {
    expect(map['gpt-4-0613']?.safe).toBe('gpt-4')
    expect(map['gpt-4o-2024-05-13']?.safe).toBe('gpt-4o')
  })

  it('basic major: model not in last generation gets major = ultimate', () => {
    expect(map['gpt-4-0613']?.major).toBe('gpt-5.4')
    expect(map['gpt-4']?.major).toBe('gpt-5.4')
    expect(map['gpt-4o-2024-05-13']?.major).toBe('gpt-5.4')
  })

  it('last model of last generation gets safe=null, major=null', () => {
    expect(map['gpt-5.4']).toEqual({ safe: null, major: null })
    expect(map['claude-sonnet-4.6']).toEqual({ safe: null, major: null })
  })

  it('major=null when it would equal safe (redundant)', () => {
    expect(map['claude-3.5-sonnet-20240620']?.safe).toBe('claude-3.5-sonnet-20241022')
    expect(map['claude-3.5-sonnet-20240620']?.major).toBe('claude-sonnet-4.6')
    expect(map['claude-3.5-sonnet-20241022']?.safe).toBeNull()
    expect(map['claude-3.5-sonnet-20241022']?.major).toBe('claude-sonnet-4.6')
  })

  it('separator variant: claude-sonnet-4.6 generates claude-sonnet-4-6', () => {
    expect(map['claude-sonnet-4-6']).toEqual({ safe: null, major: null })
  })

  it('separator variant: gpt-5.2 generates gpt-5-2 with hyphen targets', () => {
    expect(map['gpt-5-2']).toEqual({ safe: 'gpt-5-4', major: null })
  })

  it('separator variant: claude-3.5-sonnet-20240620 generates hyphen variant', () => {
    expect(map['claude-3-5-sonnet-20240620']).toBeDefined()
    expect(map['claude-3-5-sonnet-20240620']?.safe).toBe('claude-3-5-sonnet-20241022')
    expect(map['claude-3-5-sonnet-20240620']?.major).toBe('claude-sonnet-4-6')
  })

  it('no dot-variant for date codes: 20240229 stays unchanged', () => {
    expect(map['claude-3-sonnet-20240229']).toBeDefined()
    expect(map['claude-3-sonnet.20240229']).toBeUndefined()
  })

  it('prefix generation: openai-flagship generates openai/ entries', () => {
    expect(map['openai/gpt-4']).toBeDefined()
    expect(map['openai/gpt-4']?.safe).toBeNull()
    expect(map['openai/gpt-4']?.major).toBe('openai/gpt-5.4')
  })

  it('prefix generation: anthropic-sonnet generates anthropic/ entries', () => {
    expect(map['anthropic/claude-sonnet-4.6']).toEqual({
      safe: null,
      major: null,
    })
    expect(map['anthropic/claude-3-sonnet-20240229']).toBeDefined()
    expect(map['anthropic/claude-3-sonnet-20240229']?.major).toBe(
      'anthropic/claude-sonnet-4.6',
    )
  })

  it('prefix with separator variant: openai/gpt-5.2 generates openai/gpt-5-2', () => {
    expect(map['openai/gpt-5-2']).toBeDefined()
    expect(map['openai/gpt-5-2']).toEqual({ safe: 'openai/gpt-5-4', major: null })
  })

  it('prefix with separator variant: anthropic/claude-sonnet-4.6 → 4-6', () => {
    expect(map['anthropic/claude-sonnet-4-6']).toEqual({
      safe: null,
      major: null,
    })
  })
})

describe('deriveUpgradeMap — single-model generation', () => {
  const singleFamilies: FamiliesMap = {
    'test-line': [['model-a', 'model-b'], ['model-c']],
  }
  const map = deriveUpgradeMap(singleFamilies)

  it('single model in last gen gets safe=null, major=null', () => {
    expect(map['model-c']).toEqual({ safe: null, major: null })
  })

  it('model in last gen but not last gets safe=last, major=null', () => {
    const twoInLast: FamiliesMap = {
      'test-line': [['model-a'], ['model-b', 'model-c']],
    }
    const m = deriveUpgradeMap(twoInLast)
    expect(m['model-b']).toEqual({ safe: 'model-c', major: null })
  })

  it('earlier gen models point to ultimate', () => {
    expect(map['model-a']?.major).toBe('model-c')
    expect(map['model-b']?.major).toBe('model-c')
  })
})

describe('PREFIX_RULES', () => {
  it('matches expected lineage patterns', () => {
    const cases: [string, string[]][] = [
      ['openai-flagship', ['openai/']],
      ['anthropic-haiku', ['anthropic/']],
      ['google-flash', ['google/', 'gemini/']],
      ['gemini-pro', ['google/', 'gemini/']],
      ['deepseek-v3', ['deepseek/']],
      ['xai-grok', ['x-ai/']],
    ]
    for (const [key, expected] of cases) {
      const match = PREFIX_RULES.find(r => r.pattern.test(key))
      expect(match?.prefixes).toEqual(expected)
    }
  })

  it('does not match unknown lineage keys', () => {
    const match = PREFIX_RULES.find(r => r.pattern.test('cohere-command'))
    expect(match).toBeUndefined()
  })
})
