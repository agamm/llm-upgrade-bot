import { describe, it, expect } from 'vitest'
import {
  allModelsInFamilies,
  findModelInFamilies,
  loadFamilies,
  type FamiliesMap,
} from '../../src/core/families.js'

const testFamilies: FamiliesMap = {
  'openai-flagship': [
    ['gpt-4-0613', 'gpt-4'],
    ['gpt-4o-2024-05-13', 'gpt-4o'],
    ['gpt-5.4'],
  ],
  'openai-mini': [['gpt-4o-mini'], ['gpt-5-mini']],
}

describe('allModelsInFamilies', () => {
  it('returns all model IDs from all lineages', () => {
    const result = allModelsInFamilies(testFamilies)
    expect(result).toEqual(
      new Set([
        'gpt-4-0613',
        'gpt-4',
        'gpt-4o-2024-05-13',
        'gpt-4o',
        'gpt-5.4',
        'gpt-4o-mini',
        'gpt-5-mini',
      ]),
    )
    expect(result.size).toBe(7)
  })

  it('returns empty set for empty map', () => {
    const result = allModelsInFamilies({})
    expect(result.size).toBe(0)
  })
})

describe('findModelInFamilies', () => {
  it('finds model at correct position in first generation', () => {
    const result = findModelInFamilies(testFamilies, 'gpt-4')
    expect(result).toEqual({
      lineageKey: 'openai-flagship',
      genIndex: 0,
      posIndex: 1,
    })
  })

  it('finds model in later generation', () => {
    const result = findModelInFamilies(testFamilies, 'gpt-5.4')
    expect(result).toEqual({
      lineageKey: 'openai-flagship',
      genIndex: 2,
      posIndex: 0,
    })
  })

  it('finds model in different lineage', () => {
    const result = findModelInFamilies(testFamilies, 'gpt-5-mini')
    expect(result).toEqual({
      lineageKey: 'openai-mini',
      genIndex: 1,
      posIndex: 0,
    })
  })

  it('returns null for unknown model', () => {
    const result = findModelInFamilies(testFamilies, 'claude-3-opus')
    expect(result).toBeNull()
  })
})

describe('loadFamilies', () => {
  it('returns error for non-existent path', () => {
    const result = loadFamilies('/nonexistent/families.json')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('Failed to load families.json')
    }
  })
})
