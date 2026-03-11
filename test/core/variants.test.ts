import { describe, it, expect } from 'vitest'
import { stripPrefix, prefilter } from '../../src/core/variants.js'

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

describe('prefilter', () => {
  it('keeps genuinely new models', () => {
    expect(prefilter(['gpt-6', 'claude-haiku-5.0'])).toEqual([
      'gpt-6', 'claude-haiku-5.0',
    ])
  })

  it('strips fine-tune prefixes', () => {
    expect(prefilter([
      'ft:gpt-4o-2024-08-06:my-org:custom:abc123',
      'ft-gpt-4o-mini',
    ])).toEqual([])
  })

  it('strips colon-tagged models', () => {
    expect(prefilter(['gpt-4o:free', 'gpt-4o:nitro'])).toEqual([])
  })

  it('strips org-scoped fine-tunes', () => {
    expect(prefilter(['accounts/my-org/models/ft-abc'])).toEqual([])
  })

  it('strips @-scoped models', () => {
    expect(prefilter(['user@org/custom-model'])).toEqual([])
  })

  it('keeps provider-prefixed models (AI decides relevance)', () => {
    expect(prefilter(['openai/gpt-5.4', 'anthropic/claude-opus-4.6'])).toEqual([
      'openai/gpt-5.4', 'anthropic/claude-opus-4.6',
    ])
  })

  it('keeps non-chat models (AI decides relevance)', () => {
    expect(prefilter(['text-embedding-4-large', 'whisper-2'])).toEqual([
      'text-embedding-4-large', 'whisper-2',
    ])
  })

  it('handles mixed bag correctly', () => {
    expect(prefilter([
      'gpt-6',
      'ft:gpt-4o:my-org:custom:x',
      'openai/gpt-5',
      'some-model:free',
      'accounts/org/models/abc',
    ])).toEqual(['gpt-6', 'openai/gpt-5'])
  })
})
