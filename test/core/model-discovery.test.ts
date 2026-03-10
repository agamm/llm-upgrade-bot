import { describe, it, expect } from 'vitest'
import {
  filterChatModels,
  diffModels,
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
