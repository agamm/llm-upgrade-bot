import { describe, it, expect } from 'vitest'
import { readFile } from 'node:fs/promises'
import { join } from 'node:path'
import { scanFile } from '../../src/core/scanner.js'
import type { UpgradeMap } from '../../src/core/types.js'
import { loadRealMap } from '../helpers/load-map.js'

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures', 'sample-project')

/** Minimal upgrade map for unit tests */
const testMap: UpgradeMap = {
  // Native model IDs
  'gpt-4': { safe: null, major: 'gpt-4.1' },
  'gpt-4o-2024-05-13': { safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' },
  'gpt-3.5-turbo': { safe: null, major: 'gpt-4.1-mini' },
  'claude-3-opus-20240229': { safe: null, major: 'claude-opus-4-6' },
  'claude-3-haiku-20240307': { safe: null, major: 'claude-haiku-4-5-20251001' },
  'claude-3-5-sonnet-20240620': {
    safe: 'claude-3-5-sonnet-20241022',
    major: 'claude-sonnet-4-6',
  },
  'gemini-pro': { safe: null, major: 'gemini-2.5-pro' },
  // OpenRouter-prefixed (provider/model)
  'openai/gpt-4': { safe: null, major: 'openai/gpt-4.1' },
  'anthropic/claude-3-opus-20240229': { safe: null, major: 'anthropic/claude-opus-4-6' },
  'google/gemini-pro': { safe: null, major: 'google/gemini-2.5-pro' },
  // AWS Bedrock-prefixed (provider.model-vN:M)
  'anthropic.claude-3-opus-20240229-v1:0': { safe: null, major: 'anthropic.claude-opus-4-6-v1:0' },
  // LiteLLM-prefixed (provider/provider-model)
  'gemini/gemini-1.5-pro': { safe: null, major: 'gemini/gemini-2.5-pro' },
}

describe('scanFile', () => {
  it('finds double-quoted model strings and returns correct line and column', () => {
    const content = 'const MODEL = "gpt-4o-2024-05-13"\n'
    const results = scanFile('test.ts', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      file: 'test.ts',
      line: 1,
      column: 14,
      matchedText: 'gpt-4o-2024-05-13',
      safeUpgrade: 'gpt-4o-2024-08-06',
      majorUpgrade: 'gpt-4.1',
    })
  })

  it('finds single-quoted model strings', () => {
    const content = "model='gpt-4'\n"
    const results = scanFile('test.py', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      file: 'test.py',
      line: 1,
      column: 6,
      matchedText: 'gpt-4',
      safeUpgrade: null,
      majorUpgrade: 'gpt-4.1',
    })
  })

  it('returns safe and major upgrades from the map lookup', () => {
    const content = 'const m = "claude-3-5-sonnet-20240620"\n'
    const results = scanFile('test.ts', content, testMap)

    expect(results).toHaveLength(1)
    const result = results[0]
    expect(result).toBeDefined()
    expect(result?.safeUpgrade).toBe('claude-3-5-sonnet-20241022')
    expect(result?.majorUpgrade).toBe('claude-sonnet-4-6')
  })

  it('returns empty array for files with no model matches', () => {
    const content = `
function add(a: number, b: number): number {
  return a + b
}
`
    const results = scanFile('utils.ts', content, testMap)
    expect(results).toEqual([])
  })

  it('returns empty array when quoted strings exist but none are in the map', () => {
    const content = 'const name = "Alice"\nconst role = "admin"\n'
    const results = scanFile('users.ts', content, testMap)
    expect(results).toEqual([])
  })

  it('handles multiple matches in one file', () => {
    const content = `const MODEL = "gpt-4o-2024-05-13"
const BACKUP = "gpt-3.5-turbo"
`
    const results = scanFile('api.ts', content, testMap)

    expect(results).toHaveLength(2)
    expect(results[0]?.matchedText).toBe('gpt-4o-2024-05-13')
    expect(results[0]?.line).toBe(1)
    expect(results[1]?.matchedText).toBe('gpt-3.5-turbo')
    expect(results[1]?.line).toBe(2)
  })

  it('handles matches across different quote styles in same file', () => {
    const content = `model = "gpt-4"
fallback = 'gemini-pro'
`
    const results = scanFile('mixed.py', content, testMap)

    expect(results).toHaveLength(2)
    expect(results[0]?.matchedText).toBe('gpt-4')
    expect(results[0]?.column).toBe(8)
    expect(results[1]?.matchedText).toBe('gemini-pro')
    expect(results[1]?.column).toBe(11)
  })

  it('tracks line numbers correctly with multi-line content', () => {
    const content = `// header comment
// another comment
const x = "gpt-4"
`
    const results = scanFile('test.ts', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.line).toBe(3)
    expect(results[0]?.column).toBe(10)
  })

  it('column points to the opening quote character (0-based)', () => {
    // Verify column is 0-based and points at the opening quote
    const content = '"gpt-4"\n'
    const results = scanFile('test.ts', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.column).toBe(0)
  })

  it('finds backtick-quoted model strings (Go raw strings, JS template literals)', () => {
    const content = 'model := `gpt-4`\n'
    const results = scanFile('main.go', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      file: 'main.go',
      line: 1,
      column: 9,
      matchedText: 'gpt-4',
      safeUpgrade: null,
      majorUpgrade: 'gpt-4.1',
    })
  })

  it('matches OpenRouter-prefixed model IDs and preserves prefix in upgrades', () => {
    const content = 'model: "openai/gpt-4"\n'
    const results = scanFile('config.yaml', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      file: 'config.yaml',
      line: 1,
      column: 7,
      matchedText: 'openai/gpt-4',
      safeUpgrade: null,
      majorUpgrade: 'openai/gpt-4.1',
    })
  })

  it('matches Bedrock-prefixed model IDs (dot separator, version suffix)', () => {
    const content = '{"modelId": "anthropic.claude-3-opus-20240229-v1:0"}\n'
    const results = scanFile('config.json', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('anthropic.claude-3-opus-20240229-v1:0')
    expect(results[0]?.majorUpgrade).toBe('anthropic.claude-opus-4-6-v1:0')
  })

  it('matches LiteLLM-prefixed model IDs (provider/provider-model)', () => {
    const content = "model = 'gemini/gemini-1.5-pro'\n"
    const results = scanFile('app.py', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gemini/gemini-1.5-pro')
    expect(results[0]?.majorUpgrade).toBe('gemini/gemini-2.5-pro')
  })

  it('does not confuse native and prefixed variants', () => {
    const content = `primary = "gpt-4"
openrouter = "openai/gpt-4"
`
    const results = scanFile('multi.py', content, testMap)

    expect(results).toHaveLength(2)
    // Native gets native upgrade
    expect(results[0]?.matchedText).toBe('gpt-4')
    expect(results[0]?.majorUpgrade).toBe('gpt-4.1')
    // Prefixed gets prefixed upgrade
    expect(results[1]?.matchedText).toBe('openai/gpt-4')
    expect(results[1]?.majorUpgrade).toBe('openai/gpt-4.1')
  })

  it('finds models across all three quote styles in one file', () => {
    const content = `model1 = "gpt-4"
model2 = 'gemini-pro'
model3 = \`claude-3-opus-20240229\`
`
    const results = scanFile('mixed.go', content, testMap)

    expect(results).toHaveLength(3)
    const texts = results.map((r) => r.matchedText).sort()
    expect(texts).toEqual(['claude-3-opus-20240229', 'gemini-pro', 'gpt-4'])
  })
})

describe('scanFile with markdown files', () => {
  it('matches bare (unquoted) model names in .md files', () => {
    const content = 'We recommend gpt-4 for complex tasks.\n'
    const results = scanFile('README.md', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gpt-4')
    expect(results[0]?.majorUpgrade).toBe('gpt-4.1')
  })

  it('matches bare model names in .mdx files', () => {
    const content = 'Use gemini-pro as the default model.\n'
    const results = scanFile('docs/guide.mdx', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gemini-pro')
  })

  it('skips model names inside curly braces (template placeholders)', () => {
    const content = 'Set model to {gpt-4} in the config.\n'
    const results = scanFile('docs.md', content, testMap)

    expect(results).toEqual([])
  })

  it('skips model names inside quotes (handled by quoted regex)', () => {
    const content = 'Use "gpt-4" for best results.\n'
    const results = scanFile('docs.md', content, testMap)

    // Should find via quoted regex only, not double-counted by bare
    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gpt-4')
  })

  it('does not match bare model names in non-markdown files', () => {
    const content = 'Use gpt-4 for best results.\n'
    const results = scanFile('notes.txt', content, testMap)

    expect(results).toEqual([])
  })

  it('matches both quoted and bare model names in markdown', () => {
    const content = 'Use gpt-4 or `gemini-pro` for tasks.\n'
    const results = scanFile('guide.md', content, testMap)

    expect(results).toHaveLength(2)
    const texts = results.map((r) => r.matchedText).sort()
    expect(texts).toEqual(['gemini-pro', 'gpt-4'])
  })
})

describe('scanFile with colon-tagged models', () => {
  it('strips OpenRouter colon tags and appends to upgrade targets', () => {
    const content = 'model: "openai/gpt-4:free"\n'
    const results = scanFile('config.yaml', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]).toEqual({
      file: 'config.yaml',
      line: 1,
      column: 7,
      matchedText: 'openai/gpt-4:free',
      safeUpgrade: null,
      majorUpgrade: 'openai/gpt-4.1:free',
    })
  })

  it('preserves Bedrock numeric colon suffixes as exact match', () => {
    const content = '{"modelId": "anthropic.claude-3-opus-20240229-v1:0"}\n'
    const results = scanFile('config.json', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('anthropic.claude-3-opus-20240229-v1:0')
    expect(results[0]?.majorUpgrade).toBe('anthropic.claude-opus-4-6-v1:0')
  })

  it('handles colon-tagged native models', () => {
    const content = "model='gpt-4:nitro'\n"
    const results = scanFile('app.py', content, testMap)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gpt-4:nitro')
    expect(results[0]?.safeUpgrade).toBeNull()
    expect(results[0]?.majorUpgrade).toBe('gpt-4.1:nitro')
  })

  it('returns empty for unknown model with colon tag', () => {
    const content = '"unknown-model:free"\n'
    const results = scanFile('test.ts', content, testMap)
    expect(results).toEqual([])
  })

  it('appends colon tag to both safe and major targets', () => {
    const mapWithSafe = {
      ...testMap,
      'gpt-4o-2024-05-13': { safe: 'gpt-4o-2024-08-06', major: 'gpt-4.1' },
    }
    const content = '"gpt-4o-2024-05-13:exacto"\n'
    const results = scanFile('test.ts', content, mapWithSafe)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('gpt-4o-2024-05-13:exacto')
    expect(results[0]?.safeUpgrade).toBe('gpt-4o-2024-08-06:exacto')
    expect(results[0]?.majorUpgrade).toBe('gpt-4.1:exacto')
  })
})

describe('scanFile with fixture files', () => {
  it('finds correct matches in api.ts', async () => {
    const content = await readFile(join(FIXTURES_DIR, 'api.ts'), 'utf-8')
    const map = await loadRealMap()
    const results = scanFile('api.ts', content, map)

    expect(results).toHaveLength(2)
    expect(results[0]?.matchedText).toBe('gpt-4o-2024-05-13')
    expect(results[0]?.line).toBe(1)
    expect(results[1]?.matchedText).toBe('gpt-3.5-turbo')
    expect(results[1]?.line).toBe(2)

    // Each result should have at least one upgrade path
    for (const r of results) {
      expect(r.safeUpgrade !== null || r.majorUpgrade !== null).toBe(true)
    }
  })

  it('finds correct matches in config.yaml', async () => {
    const content = await readFile(join(FIXTURES_DIR, 'config.yaml'), 'utf-8')
    const map = await loadRealMap()
    const results = scanFile('config.yaml', content, map)

    expect(results).toHaveLength(2)
    expect(results[0]?.matchedText).toBe('claude-3-opus-20240229')
    expect(results[1]?.matchedText).toBe('claude-3-haiku-20240307')
  })

  it('finds correct matches in app.py (single-quoted strings)', async () => {
    const content = await readFile(join(FIXTURES_DIR, 'app.py'), 'utf-8')
    const map = await loadRealMap()
    const results = scanFile('app.py', content, map)

    expect(results).toHaveLength(2)
    expect(results[0]?.matchedText).toBe('gpt-4')
    expect(results[1]?.matchedText).toBe('gemini-pro')
  })

  it('finds correct matches in settings.json', async () => {
    const content = await readFile(join(FIXTURES_DIR, 'settings.json'), 'utf-8')
    const map = await loadRealMap()
    const results = scanFile('settings.json', content, map)

    expect(results).toHaveLength(1)
    expect(results[0]?.matchedText).toBe('claude-3-5-sonnet-20240620')
  })

  it('returns empty array for clean.ts (no model strings)', async () => {
    const content = await readFile(join(FIXTURES_DIR, 'clean.ts'), 'utf-8')
    const map = await loadRealMap()
    const results = scanFile('clean.ts', content, map)

    expect(results).toEqual([])
  })
})
