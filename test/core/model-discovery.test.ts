import { describe, it, expect } from 'vitest'
import {
  filterChatModels,
  diffModels,
  isTransientError,
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
      'gpt-4o-transcribe',
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

describe('isTransientError', () => {
  it('flags HTTP 5xx as transient', () => {
    expect(isTransientError('HTTP 500')).toBe(true)
    expect(isTransientError('HTTP 502')).toBe(true)
    expect(isTransientError('HTTP 503')).toBe(true)
    expect(isTransientError('HTTP 504')).toBe(true)
  })

  it('flags rate-limit and request-timeout as transient', () => {
    expect(isTransientError('HTTP 408')).toBe(true)
    expect(isTransientError('HTTP 429')).toBe(true)
  })

  it('flags network/timeout errors as transient', () => {
    expect(isTransientError('fetch failed')).toBe(true)
    expect(isTransientError('The operation was aborted due to timeout')).toBe(true)
    expect(isTransientError('socket hang up')).toBe(true)
    expect(isTransientError('getaddrinfo ENOTFOUND api.example.com')).toBe(true)
    expect(isTransientError('connect ECONNRESET')).toBe(true)
  })

  it('does not flag auth or client errors as transient', () => {
    expect(isTransientError('HTTP 401')).toBe(false)
    expect(isTransientError('HTTP 403')).toBe(false)
    expect(isTransientError('HTTP 404')).toBe(false)
    expect(isTransientError('Missing OPENAI_API_KEY')).toBe(false)
    expect(isTransientError('invalid JSON response')).toBe(false)
  })
})
