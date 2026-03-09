import { describe, it, expect } from 'vitest'
import { tierOf, parseModelVersion, isHigherVersion } from '../../src/core/model-version.js'

describe('tierOf', () => {
  it.each([
    ['-flash', 'flash'],
    ['-flash-preview', 'flash'],
    ['-flash-lite-preview', 'flash-lite'],
    ['-pro-preview', 'pro'],
    ['-turbo-2024-04-09', 'turbo'],
    ['-sonnet-latest', 'sonnet'],
    ['-preview', ''],
    ['', ''],
    ['-mini', 'mini'],
    ['o', ''],
    ['o-mini', 'mini'],
    ['-flash-20251001', 'flash'],
    ['-turbo-instruct', 'instruct-turbo'],
  ])('tierOf(%j) → %j', (suffix, expected) => {
    expect(tierOf(suffix)).toBe(expected)
  })
})

describe('parseModelVersion', () => {
  it('parses gpt-4', () => {
    expect(parseModelVersion('gpt-4')).toEqual({
      line: 'gpt', version: [4], suffix: '', tier: '',
    })
  })

  it('parses gpt-4o-mini', () => {
    expect(parseModelVersion('gpt-4o-mini')).toEqual({
      line: 'gpt', version: [4], suffix: 'o-mini', tier: 'mini',
    })
  })

  it('parses gemini-2.0-flash', () => {
    expect(parseModelVersion('gemini-2.0-flash')).toEqual({
      line: 'gemini', version: [2, 0], suffix: '-flash', tier: 'flash',
    })
  })

  it('parses gemini-3-flash-preview', () => {
    expect(parseModelVersion('gemini-3-flash-preview')).toEqual({
      line: 'gemini', version: [3], suffix: '-flash-preview', tier: 'flash',
    })
  })

  it('parses o1-mini', () => {
    expect(parseModelVersion('o1-mini')).toEqual({
      line: 'o', version: [1], suffix: '-mini', tier: 'mini',
    })
  })

  it('parses gpt-4.1', () => {
    expect(parseModelVersion('gpt-4.1')).toEqual({
      line: 'gpt', version: [4, 1], suffix: '', tier: '',
    })
  })

  it('parses gpt-4-turbo-preview', () => {
    expect(parseModelVersion('gpt-4-turbo-preview')).toEqual({
      line: 'gpt', version: [4], suffix: '-turbo-preview', tier: 'turbo',
    })
  })

  it('returns null for deepseek-chat (no version)', () => {
    expect(parseModelVersion('deepseek-chat')).toBeNull()
  })
})

describe('isHigherVersion', () => {
  it('[5] > [4]', () => {
    expect(isHigherVersion([5], [4])).toBe(true)
  })

  it('[3,5] > [3,4]', () => {
    expect(isHigherVersion([3, 5], [3, 4])).toBe(true)
  })

  it('[2] is not > [2]', () => {
    expect(isHigherVersion([2], [2])).toBe(false)
  })

  it('[1] is not > [2]', () => {
    expect(isHigherVersion([1], [2])).toBe(false)
  })

  it('[2,0] > [1,9]', () => {
    expect(isHigherVersion([2, 0], [1, 9])).toBe(true)
  })
})
