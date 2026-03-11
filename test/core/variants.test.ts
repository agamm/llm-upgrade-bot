import { describe, it, expect } from 'vitest'
import { stripPrefix } from '../../src/core/variants.js'

describe('stripPrefix', () => {
  it('strips openai/ prefix', () => {
    expect(stripPrefix('openai/gpt-5.4')).toBe('gpt-5.4')
  })

  it('strips anthropic/ prefix', () => {
    expect(stripPrefix('anthropic/claude-sonnet-4.6')).toBe('claude-sonnet-4.6')
  })

  it('strips meta-llama/ prefix', () => {
    expect(stripPrefix('meta-llama/llama-4-scout')).toBe('llama-4-scout')
  })

  it('strips any provider/ prefix pattern', () => {
    expect(stripPrefix('some-provider/model-x')).toBe('model-x')
  })

  it('returns bare ID unchanged', () => {
    expect(stripPrefix('gpt-5.4')).toBe('gpt-5.4')
  })

  it('does not strip if prefix starts with number', () => {
    expect(stripPrefix('123/model')).toBe('123/model')
  })
})
