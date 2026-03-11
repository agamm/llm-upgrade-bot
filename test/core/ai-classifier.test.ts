import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { prefilter, applyOutput, classifyNewModels } from '../../src/core/ai-classifier.js'
import type { AgentOutput } from '../../src/core/ai-classifier.js'
import type { FamiliesMap } from '../../src/core/families.js'

// ── Test families ───────────────────────────────────────────

const TINY_FAMILIES: FamiliesMap = {
  'openai-flagship': [
    ['gpt-4o'],
    ['gpt-5'],
    ['gpt-5.4'],
  ],
  'openai-mini': [
    ['gpt-4o-mini'],
    ['gpt-5-mini'],
  ],
  'anthropic-sonnet': [
    ['claude-3.5-sonnet-20241022'],
    ['claude-sonnet-4.6'],
  ],
}

// ── prefilter ───────────────────────────────────────────────

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

// ── applyOutput ─────────────────────────────────────────────

describe('applyOutput', () => {
  it('appends a model to an existing generation', () => {
    const output: AgentOutput = {
      placements: [
        { modelId: 'gpt-5-2025-08-07', familyKey: 'openai-flagship', genIndex: 1, position: 'append' },
      ],
      newFamilies: [],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['openai-flagship']?.[1]).toEqual(['gpt-5', 'gpt-5-2025-08-07'])
  })

  it('inserts a new generation after genIndex', () => {
    const output: AgentOutput = {
      placements: [
        { modelId: 'gpt-5.5', familyKey: 'openai-flagship', genIndex: 1, position: 'new_generation' },
      ],
      newFamilies: [],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['openai-flagship']).toEqual([
      ['gpt-4o'],
      ['gpt-5'],
      ['gpt-5.5'],
      ['gpt-5.4'],
    ])
  })

  it('prepends a generation with genIndex -1', () => {
    const output: AgentOutput = {
      placements: [
        { modelId: 'gpt-3.5-turbo', familyKey: 'openai-flagship', genIndex: -1, position: 'new_generation' },
      ],
      newFamilies: [],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['openai-flagship']?.[0]).toEqual(['gpt-3.5-turbo'])
    expect(result['openai-flagship']?.[1]).toEqual(['gpt-4o'])
  })

  it('creates a new lineage', () => {
    const output: AgentOutput = {
      placements: [],
      newFamilies: [
        { familyKey: 'cohere-command', generations: [['command-r'], ['command-r-plus']] },
      ],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['cohere-command']).toEqual([['command-r'], ['command-r-plus']])
  })

  it('does not overwrite existing lineage', () => {
    const output: AgentOutput = {
      placements: [],
      newFamilies: [
        { familyKey: 'openai-flagship', generations: [['fake']] },
      ],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['openai-flagship']).toEqual(TINY_FAMILIES['openai-flagship'])
  })

  it('ignores placements with unknown lineage key', () => {
    const output: AgentOutput = {
      placements: [
        { modelId: 'foo-1', familyKey: 'nonexistent', genIndex: 0, position: 'append' },
      ],
      newFamilies: [],
      unclassified: [],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result).toEqual(TINY_FAMILIES)
  })

  it('does not mutate the original families', () => {
    const original = structuredClone(TINY_FAMILIES)
    const output: AgentOutput = {
      placements: [
        { modelId: 'gpt-5.5', familyKey: 'openai-flagship', genIndex: 2, position: 'append' },
      ],
      newFamilies: [],
      unclassified: [],
    }
    applyOutput(TINY_FAMILIES, output)
    expect(TINY_FAMILIES).toEqual(original)
  })

  it('handles multiple placements and new lineages together', () => {
    const output: AgentOutput = {
      placements: [
        { modelId: 'gpt-5.4-2026-03-05', familyKey: 'openai-flagship', genIndex: 2, position: 'append' },
        { modelId: 'gpt-5-mini-2025-08-07', familyKey: 'openai-mini', genIndex: 1, position: 'append' },
      ],
      newFamilies: [
        { familyKey: 'openai-nano', generations: [['gpt-5-nano']] },
      ],
      unclassified: ['random-model-xyz'],
    }
    const result = applyOutput(TINY_FAMILIES, output)
    expect(result['openai-flagship']?.[2]).toEqual(['gpt-5.4', 'gpt-5.4-2026-03-05'])
    expect(result['openai-mini']?.[1]).toEqual(['gpt-5-mini', 'gpt-5-mini-2025-08-07'])
    expect(result['openai-nano']).toEqual([['gpt-5-nano']])
  })
})

// ── classifyNewModels ───────────────────────────────────────

describe('classifyNewModels', () => {
  const originalKey = process.env['ANTHROPIC_API_KEY']

  afterEach(() => {
    if (originalKey !== undefined) {
      process.env['ANTHROPIC_API_KEY'] = originalKey
    } else {
      delete process.env['ANTHROPIC_API_KEY']
    }
  })

  it('returns empty result for empty input', async () => {
    const result = await classifyNewModels(TINY_FAMILIES, [])
    expect(result).toEqual({ families: TINY_FAMILIES, unclassified: [] })
  })

  it('falls back to all-unclassified when ANTHROPIC_API_KEY is missing', async () => {
    delete process.env['ANTHROPIC_API_KEY']
    const result = await classifyNewModels(TINY_FAMILIES, ['new-model-1', 'new-model-2'])
    expect(result.unclassified).toEqual(['new-model-1', 'new-model-2'])
    expect(result.families).toEqual(TINY_FAMILIES)
  })
})
