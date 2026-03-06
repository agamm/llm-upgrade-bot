import { describe, it, expect } from 'vitest'
import { buildPrefixRegex, fileMatchesPrefixFilter } from '../../src/core/prefix-filter.js'
import type { UpgradeMap } from '../../src/core/types.js'
import { loadRealMap } from '../helpers/load-map.js'

describe('buildPrefixRegex', () => {
  it('matches all map keys that have separator-based stems', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-4.1' },
      'gpt-4o-2024-05-13': { safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' },
      'claude-3-opus-20240229': { safe: null, major: 'claude-opus-4-6' },
      'openai/gpt-4': { safe: null, major: 'openai/gpt-4.1' },
      'gemini-pro': { safe: null, major: 'gemini-2.5-pro' },
      'anthropic.claude-3-opus-20240229-v1:0': {
        safe: null,
        major: 'anthropic.claude-opus-4-6-v1:0',
      },
      'anthropic/claude-3-opus-20240229': {
        safe: null,
        major: 'anthropic/claude-opus-4-6',
      },
      'gemini/gemini-1.5-pro': {
        safe: null,
        major: 'gemini/gemini-2.5-pro',
      },
    }

    const regex = buildPrefixRegex(map)

    // Every key in the map should be matched by the prefix regex
    for (const key of Object.keys(map)) {
      expect(regex.test(key)).toBe(true)
    }

    // Should NOT match unrelated strings
    expect(regex.test('no model here')).toBe(false)
    expect(regex.test('llama-3')).toBe(false)
  })

  it('returns a RegExp that matches lines containing provider stems', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-4.1' },
      'claude-3-opus-20240229': { safe: null, major: 'claude-opus-4-6' },
    }

    const regex = buildPrefixRegex(map)

    expect(regex).toBeInstanceOf(RegExp)
    expect(regex.test('model = "gpt-4"')).toBe(true)
    expect(regex.test('const model = "claude-3-opus-20240229"')).toBe(true)
    // 'openai/gpt-4' still matches because it contains 'gpt-' which is a stem
    expect(regex.test('openai/gpt-4')).toBe(true)
    expect(regex.test('no model here')).toBe(false)
    expect(regex.test('some random text with llama-3')).toBe(false)
  })

  it('deduplicates stems so each appears only once', () => {
    const map: UpgradeMap = {
      'gpt-4': { safe: null, major: 'gpt-4.1' },
      'gpt-4-0613': { safe: null, major: 'gpt-4.1' },
      'gpt-4o-2024-05-13': { safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' },
      'gpt-3.5-turbo': { safe: null, major: 'gpt-4.1-mini' },
    }

    const regex = buildPrefixRegex(map)
    const source = regex.source

    // gpt- should appear in the regex pattern, but only once in the alternatives
    const alternatives = source.split('|')
    const gptStems = alternatives.filter((alt) => alt.includes('gpt-'))
    expect(gptStems).toHaveLength(1)
  })

  it('handles an empty map gracefully', () => {
    const map: UpgradeMap = {}
    const regex = buildPrefixRegex(map)

    // An empty map should produce a regex that matches nothing
    expect(regex.test('gpt-4')).toBe(false)
    expect(regex.test('claude-3-opus')).toBe(false)
    expect(regex.test('')).toBe(false)
  })

  it('works with actual data/upgrades.json entries', async () => {
    const map = await loadRealMap()
    const regex = buildPrefixRegex(map)

    // Should produce a non-trivial regex from the real data
    expect(regex.source.length).toBeGreaterThan(10)

    // Regex should match keys that have clear provider stems
    const keysWithStems = Object.keys(map).filter((k) => /[-/.]/.test(k))
    for (const key of keysWithStems) {
      expect(regex.test(key)).toBe(true)
    }
  })
})

describe('fileMatchesPrefixFilter', () => {
  let regex: RegExp

  // Build regex from a representative map
  const map: UpgradeMap = {
    'gpt-4': { safe: null, major: 'gpt-4.1' },
    'claude-3-opus-20240229': { safe: null, major: 'claude-opus-4-6' },
    'openai/gpt-4': { safe: null, major: 'openai/gpt-4.1' },
    'gemini-pro': { safe: null, major: 'gemini-2.5-pro' },
    'anthropic.claude-3-opus-20240229-v1:0': {
      safe: null,
      major: 'anthropic.claude-opus-4-6-v1:0',
    },
  }

  it('returns true for files with model stems', () => {
    regex = buildPrefixRegex(map)

    const pythonFile = `
import openai

client = openai.Client()
response = client.chat.completions.create(
    model="gpt-4",
    messages=[{"role": "user", "content": "Hello"}]
)
`
    expect(fileMatchesPrefixFilter(pythonFile, regex)).toBe(true)
  })

  it('returns true for files with Claude model references', () => {
    regex = buildPrefixRegex(map)

    const tsFile = `
const MODEL = 'claude-3-opus-20240229';
const response = await anthropic.messages.create({
  model: MODEL,
  max_tokens: 1024,
});
`
    expect(fileMatchesPrefixFilter(tsFile, regex)).toBe(true)
  })

  it('returns true for files with Bedrock-style model references', () => {
    regex = buildPrefixRegex(map)

    const content = `
{
  "modelId": "anthropic.claude-3-opus-20240229-v1:0",
  "contentType": "application/json"
}
`
    expect(fileMatchesPrefixFilter(content, regex)).toBe(true)
  })

  it('returns true for files with OpenRouter platform variant', () => {
    regex = buildPrefixRegex(map)

    const yamlContent = `
model: openai/gpt-4
temperature: 0.7
`
    expect(fileMatchesPrefixFilter(yamlContent, regex)).toBe(true)
  })

  it('returns false for files without model stems', () => {
    regex = buildPrefixRegex(map)

    const plainCode = `
function add(a: number, b: number): number {
  return a + b;
}

const result = add(1, 2);
console.log(result);

// This is a utility module with no LLM references
export default { add };
`
    expect(fileMatchesPrefixFilter(plainCode, regex)).toBe(false)
  })

  it('returns false for files with similar but non-matching prefixes', () => {
    regex = buildPrefixRegex(map)

    const content = `
// This file discusses GPT concepts (uppercase, no dash)
// and Claude Shannon's information theory
// gemstone polishing instructions
const department = "General Purpose Technology";
`
    expect(fileMatchesPrefixFilter(content, regex)).toBe(false)
  })

  it('returns false for empty content', () => {
    regex = buildPrefixRegex(map)
    expect(fileMatchesPrefixFilter('', regex)).toBe(false)
  })

  it('handles files with multiple model references', () => {
    regex = buildPrefixRegex(map)

    const multiModelFile = `
const models = {
  fast: "gpt-4",
  smart: "claude-3-opus-20240229",
  search: "gemini-pro",
};
`
    expect(fileMatchesPrefixFilter(multiModelFile, regex)).toBe(true)
  })

  it('works with actual upgrades.json data', async () => {
    const realMap = await loadRealMap()
    const realRegex = buildPrefixRegex(realMap)

    // File with real model IDs should match
    const withModels = `
config:
  primary_model: "gpt-4o-2024-05-13"
  fallback_model: "claude-3-5-sonnet-20241022"
  embedding_model: "gemini/gemini-1.5-pro"
`
    expect(fileMatchesPrefixFilter(withModels, realRegex)).toBe(true)

    // File with no model references should not match
    const noModels = `
const express = require('express');
const app = express();
app.get('/health', (req, res) => res.json({ status: 'ok' }));
app.listen(3000);
`
    expect(fileMatchesPrefixFilter(noModels, realRegex)).toBe(false)
  })
})
