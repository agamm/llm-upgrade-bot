import { describe, it, expect } from 'vitest'
import { tierOf, parseModelVersion, isHigherVersion, normalizeVersionSeparators, matchSeparatorStyle } from '../../src/core/model-version.js'

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
    ['-codex-mini', 'codex-mini'],
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

describe('normalizeVersionSeparators', () => {
  it.each([
    ['claude-sonnet-4-6', 'claude-sonnet-4.6'],
    ['claude-sonnet-4.6', 'claude-sonnet-4.6'],
    ['claude-3-5-sonnet', 'claude-3.5-sonnet'],
    ['gpt-4o-mini', 'gpt-4o-mini'],
    ['gemini-2.0-flash', 'gemini-2.0-flash'],
    ['o3-mini', 'o3-mini'],
  ])('normalizeVersionSeparators(%j) → %j', (input, expected) => {
    expect(normalizeVersionSeparators(input)).toBe(expected)
  })
})

describe('matchSeparatorStyle', () => {
  it.each([
    // Reference uses hyphens → convert dots to hyphens
    ['claude-sonnet-5.0', 'claude-sonnet-4-0', 'claude-sonnet-5-0'],
    ['claude-sonnet-5.6', 'claude-sonnet-4-6', 'claude-sonnet-5-6'],
    ['anthropic/claude-sonnet-5.0', 'anthropic/claude-sonnet-4-0', 'anthropic/claude-sonnet-5-0'],
    // Reference uses dots → convert hyphens to dots
    ['gpt-5-0', 'gpt-4.1', 'gpt-5.0'],
    // Reference has no digit separators → leave as-is
    ['gpt-5.0', 'gpt-4o', 'gpt-5.0'],
    ['gpt-5-0', 'gpt-4o', 'gpt-5-0'],
    // No conversion needed (already matches)
    ['claude-sonnet-5-0', 'claude-sonnet-4-0', 'claude-sonnet-5-0'],
    ['gpt-5.0', 'gpt-4.1', 'gpt-5.0'],
    // Gemini-style: dots in reference, no hyphens between digits
    ['gemini-3.0-flash', 'gemini-2.0-flash', 'gemini-3.0-flash'],
    // Multi-component versions
    ['claude-sonnet-5.1.2', 'claude-sonnet-4-0-1', 'claude-sonnet-5-1-2'],
    // No version digits at all → leave as-is
    ['deepseek-chat', 'deepseek-r1', 'deepseek-chat'],
  ])('matchSeparatorStyle(%j, %j) → %j', (newId, ref, expected) => {
    expect(matchSeparatorStyle(newId, ref)).toBe(expected)
  })
})
