import { describe, it, expect, afterEach } from 'vitest'
import { writeFile, readFile, mkdtemp, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { computeEdits, applyFixes } from '../../src/core/fixer.js'
import { scanFile } from '../../src/core/scanner.js'
import type { ScanResult, FileEdit, UpgradeMap } from '../../src/core/types.js'

// ─── computeEdits ───────────────────────────────────────────────────────────

describe('computeEdits', () => {
  it('uses safe upgrade when available', () => {
    const matches: ScanResult[] = [
      {
        file: 'api.ts',
        line: 1,
        column: 14,
        matchedText: 'gpt-4o-2024-05-13',
        safeUpgrade: 'gpt-4o-2024-08-06',
        majorUpgrade: 'gpt-4.1',
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      file: 'api.ts',
      line: 1,
      column: 14,
      oldText: 'gpt-4o-2024-05-13',
      newText: 'gpt-4o-2024-08-06',
    })
  })

  it('uses major upgrade when only major is available', () => {
    const matches: ScanResult[] = [
      {
        file: 'config.yaml',
        line: 3,
        column: 9,
        matchedText: 'claude-3-opus-20240229',
        safeUpgrade: null,
        majorUpgrade: 'claude-opus-4-6',
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(1)
    expect(edits[0]).toEqual({
      file: 'config.yaml',
      line: 3,
      column: 9,
      oldText: 'claude-3-opus-20240229',
      newText: 'claude-opus-4-6',
    })
  })

  it('prefers safe upgrade when both safe and major are available', () => {
    const matches: ScanResult[] = [
      {
        file: 'test.ts',
        line: 5,
        column: 10,
        matchedText: 'claude-3-5-sonnet-20240620',
        safeUpgrade: 'claude-3-5-sonnet-20241022',
        majorUpgrade: 'claude-sonnet-4-6',
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.newText).toBe('claude-3-5-sonnet-20241022')
  })

  it('skips results where both safe and major are null', () => {
    const matches: ScanResult[] = [
      {
        file: 'test.ts',
        line: 1,
        column: 0,
        matchedText: 'gpt-4.1',
        safeUpgrade: null,
        majorUpgrade: null,
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(0)
  })

  it('handles a mix of safe, major-only, and null entries', () => {
    const matches: ScanResult[] = [
      {
        file: 'a.ts',
        line: 1,
        column: 0,
        matchedText: 'gpt-4o-2024-05-13',
        safeUpgrade: 'gpt-4o-2024-08-06',
        majorUpgrade: 'gpt-4.1',
      },
      {
        file: 'b.ts',
        line: 2,
        column: 5,
        matchedText: 'gpt-4',
        safeUpgrade: null,
        majorUpgrade: 'gpt-4.1',
      },
      {
        file: 'c.ts',
        line: 3,
        column: 10,
        matchedText: 'gpt-4.1',
        safeUpgrade: null,
        majorUpgrade: null,
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(2)
    expect(edits[0]?.newText).toBe('gpt-4o-2024-08-06') // safe
    expect(edits[1]?.newText).toBe('gpt-4.1') // major fallback
  })

  it('preserves OpenRouter prefix in upgrade target', () => {
    const matches: ScanResult[] = [
      {
        file: 'config.yaml',
        line: 1,
        column: 7,
        matchedText: 'openai/gpt-4',
        safeUpgrade: null,
        majorUpgrade: 'openai/gpt-4.1',
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.oldText).toBe('openai/gpt-4')
    expect(edits[0]?.newText).toBe('openai/gpt-4.1')
  })

  it('preserves Bedrock prefix in upgrade target', () => {
    const matches: ScanResult[] = [
      {
        file: 'config.json',
        line: 1,
        column: 12,
        matchedText: 'anthropic.claude-3-opus-20240229-v1:0',
        safeUpgrade: null,
        majorUpgrade: 'anthropic.claude-opus-4-6-v1:0',
      },
    ]

    const edits = computeEdits(matches)

    expect(edits).toHaveLength(1)
    expect(edits[0]?.oldText).toBe('anthropic.claude-3-opus-20240229-v1:0')
    expect(edits[0]?.newText).toBe('anthropic.claude-opus-4-6-v1:0')
  })

  it('returns empty array for empty input', () => {
    expect(computeEdits([])).toEqual([])
  })
})

// ─── applyFixes ─────────────────────────────────────────────────────────────

describe('applyFixes', () => {
  let tmpDir: string

  /** Create a fresh temp directory before each test group. */
  async function makeTmpDir(): Promise<string> {
    tmpDir = await mkdtemp(join(tmpdir(), 'fixer-test-'))
    return tmpDir
  }

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('replaces a single string in a file', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'api.ts')
    await writeFile(filePath, 'const MODEL = "gpt-4o-2024-05-13"\n')

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 14,
        oldText: 'gpt-4o-2024-05-13',
        newText: 'gpt-4o-2024-08-06',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(1)
    expect(result.files).toEqual([filePath])

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe('const MODEL = "gpt-4o-2024-08-06"\n')
  })

  it('preserves surrounding quotes and whitespace', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'config.yaml')
    await writeFile(
      filePath,
      'llm:\n  provider: anthropic\n  model: "claude-3-opus-20240229"\n',
    )

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 3,
        column: 9,
        oldText: 'claude-3-opus-20240229',
        newText: 'claude-opus-4-6',
      },
    ]

    const result = await applyFixes(edits)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe(
      'llm:\n  provider: anthropic\n  model: "claude-opus-4-6"\n',
    )
    expect(result.applied).toBe(1)
  })

  it('handles multiple edits in the same file', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'multi.ts')
    await writeFile(
      filePath,
      'const MODEL = "gpt-4o-2024-05-13"\nconst BACKUP = "gpt-3.5-turbo"\n',
    )

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 14,
        oldText: 'gpt-4o-2024-05-13',
        newText: 'gpt-4o-2024-08-06',
      },
      {
        file: filePath,
        line: 2,
        column: 15,
        oldText: 'gpt-3.5-turbo',
        newText: 'gpt-4.1-mini',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(2)
    expect(result.files).toEqual([filePath])

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe(
      'const MODEL = "gpt-4o-2024-08-06"\nconst BACKUP = "gpt-4.1-mini"\n',
    )
  })

  it('applies edits bottom-to-top to avoid offset corruption', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'offset.ts')
    // Two models on different lines — replacing with different-length strings
    await writeFile(
      filePath,
      'const A = "gpt-4"\nconst B = "gpt-4"\n',
    )

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 10,
        oldText: 'gpt-4',
        newText: 'gpt-4.1-this-is-much-longer',
      },
      {
        file: filePath,
        line: 2,
        column: 10,
        oldText: 'gpt-4',
        newText: 'gpt-4.1-this-is-much-longer',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(2)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe(
      'const A = "gpt-4.1-this-is-much-longer"\nconst B = "gpt-4.1-this-is-much-longer"\n',
    )
  })

  it('handles edits across multiple files', async () => {
    const dir = await makeTmpDir()
    const file1 = join(dir, 'a.ts')
    const file2 = join(dir, 'b.py')
    await writeFile(file1, 'const M = "gpt-4"\n')
    await writeFile(file2, "model = 'gemini-pro'\n")

    const edits: FileEdit[] = [
      {
        file: file1,
        line: 1,
        column: 10,
        oldText: 'gpt-4',
        newText: 'gpt-4.1',
      },
      {
        file: file2,
        line: 1,
        column: 8,
        oldText: 'gemini-pro',
        newText: 'gemini-2.5-pro',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(2)
    expect(result.files).toHaveLength(2)
    expect(result.files).toContain(file1)
    expect(result.files).toContain(file2)

    const updated1 = await readFile(file1, 'utf-8')
    expect(updated1).toBe('const M = "gpt-4.1"\n')

    const updated2 = await readFile(file2, 'utf-8')
    expect(updated2).toBe("model = 'gemini-2.5-pro'\n")
  })

  it('returns zero applied and empty files for empty edits array', async () => {
    const result = await applyFixes([])

    expect(result.applied).toBe(0)
    expect(result.files).toEqual([])
  })

  it('handles two edits on the same line (column ordering)', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'sameline.ts')
    // Two model strings on the same line
    await writeFile(
      filePath,
      'const MODELS = ["gpt-4", "gemini-pro"]\n',
    )

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 16,
        oldText: 'gpt-4',
        newText: 'gpt-4.1',
      },
      {
        file: filePath,
        line: 1,
        column: 25,
        oldText: 'gemini-pro',
        newText: 'gemini-2.5-pro',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(2)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe('const MODELS = ["gpt-4.1", "gemini-2.5-pro"]\n')
  })

  it('replaces OpenRouter-prefixed model string in file', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'config.yaml')
    await writeFile(filePath, 'model: "openai/gpt-4"\n')

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 7,
        oldText: 'openai/gpt-4',
        newText: 'openai/gpt-4.1',
      },
    ]

    await applyFixes(edits)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe('model: "openai/gpt-4.1"\n')
  })

  it('replaces Bedrock-prefixed model string in file', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'bedrock.json')
    await writeFile(
      filePath,
      '{"modelId": "anthropic.claude-3-opus-20240229-v1:0"}\n',
    )

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 12,
        oldText: 'anthropic.claude-3-opus-20240229-v1:0',
        newText: 'anthropic.claude-opus-4-6-v1:0',
      },
    ]

    await applyFixes(edits)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe('{"modelId": "anthropic.claude-opus-4-6-v1:0"}\n')
  })

  it('reports zero applied when oldText no longer matches file content', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'changed.ts')
    // File was modified between scan and fix — old model already gone
    await writeFile(filePath, 'const MODEL = "gpt-4.1"\n')

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 14,
        oldText: 'gpt-4o-2024-05-13',
        newText: 'gpt-4o-2024-08-06',
      },
    ]

    const result = await applyFixes(edits)

    expect(result.applied).toBe(0)
    expect(result.files).toEqual([])
    // File should be unchanged
    const content = await readFile(filePath, 'utf-8')
    expect(content).toBe('const MODEL = "gpt-4.1"\n')
  })

  it('preserves single quotes around replaced text', async () => {
    const dir = await makeTmpDir()
    const filePath = join(dir, 'app.py')
    await writeFile(filePath, "model = 'gpt-4'\n")

    const edits: FileEdit[] = [
      {
        file: filePath,
        line: 1,
        column: 8,
        oldText: 'gpt-4',
        newText: 'gpt-4.1',
      },
    ]

    const result = await applyFixes(edits)

    const updated = await readFile(filePath, 'utf-8')
    expect(updated).toBe("model = 'gpt-4.1'\n")
    expect(result.applied).toBe(1)
  })
})

// ─── Round-trip: scan → fix → rescan ────────────────────────────────────────

describe('scan → fix → rescan round-trip', () => {
  let tmpDir: string

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  const map: UpgradeMap = {
    'gpt-4': { safe: null, major: 'gpt-4.1' },
    'claude-3-opus-20240229': { safe: null, major: 'claude-opus-4-6' },
    'openai/gpt-4': { safe: null, major: 'openai/gpt-4.1' },
  }

  it('rescan finds zero matches after fix is applied', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'roundtrip-'))
    const filePath = join(tmpDir, 'api.ts')
    await writeFile(filePath, 'const MODEL = "gpt-4"\n')

    // Scan
    const content = await readFile(filePath, 'utf-8')
    const results = scanFile('api.ts', content, map)
    expect(results).toHaveLength(1)

    // Fix
    const edits = computeEdits(results)
    await applyFixes(edits.map((e) => ({ ...e, file: filePath })))

    // Rescan — should find nothing
    const updated = await readFile(filePath, 'utf-8')
    const reResults = scanFile('api.ts', updated, map)
    expect(reResults).toEqual([])
  })

  it('multi-file round-trip with mixed native and prefixed models', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'roundtrip-multi-'))
    const file1 = join(tmpDir, 'a.py')
    const file2 = join(tmpDir, 'b.yaml')
    await writeFile(file1, "model = 'gpt-4'\n")
    await writeFile(file2, 'model: "openai/gpt-4"\n')

    // Scan both
    const c1 = await readFile(file1, 'utf-8')
    const c2 = await readFile(file2, 'utf-8')
    const r1 = scanFile('a.py', c1, map)
    const r2 = scanFile('b.yaml', c2, map)
    expect(r1).toHaveLength(1)
    expect(r2).toHaveLength(1)

    // Fix both
    const allEdits = computeEdits([...r1, ...r2])
    expect(allEdits).toHaveLength(2)
    await applyFixes([
      { ...allEdits[0] as typeof allEdits[0], file: file1 },
      { ...allEdits[1] as typeof allEdits[1], file: file2 },
    ])

    // Rescan both — zero matches
    const u1 = await readFile(file1, 'utf-8')
    const u2 = await readFile(file2, 'utf-8')
    expect(scanFile('a.py', u1, map)).toEqual([])
    expect(scanFile('b.yaml', u2, map)).toEqual([])

    // Verify correct replacements written
    expect(u1).toContain('gpt-4.1')
    expect(u2).toContain('openai/gpt-4.1')
  })
})
