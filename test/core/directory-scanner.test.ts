import { describe, it, expect } from 'vitest'
import { join } from 'node:path'
import { scanDirectory, SUPPORTED_EXTENSIONS } from '../../src/core/directory-scanner.js'
import type { UpgradeMap } from '../../src/core/types.js'
import { loadRealMap } from '../helpers/load-map.js'

const FIXTURES_DIR = join(import.meta.dirname, '..', 'fixtures', 'sample-project')

/** Minimal upgrade map for unit tests */
const testMap: UpgradeMap = {
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
}

describe('SUPPORTED_EXTENSIONS', () => {
  it('includes extensions for top GitHub languages and config files', () => {
    const expected = [
      // Web / scripting
      '.py', '.ts', '.js', '.tsx', '.jsx', '.rb', '.php', '.lua',
      // Systems / compiled
      '.go', '.java', '.rs', '.cs', '.cpp', '.cc', '.c', '.h',
      // Mobile / JVM
      '.kt', '.kts', '.swift', '.dart', '.scala',
      // Shell
      '.sh', '.bash', '.zsh',
      // Elixir / R
      '.ex', '.exs', '.r', '.R',
      // Frontend frameworks
      '.vue', '.svelte',
      // Config / data
      '.yaml', '.yml', '.json', '.toml',
      '.env', '.cfg', '.ini',
      // Infrastructure
      '.tf', '.hcl',
    ]
    for (const ext of expected) {
      expect(SUPPORTED_EXTENSIONS).toContain(ext)
    }
  })

  it('is a frozen set of extensions', () => {
    expect(SUPPORTED_EXTENSIONS.length).toBeGreaterThanOrEqual(35)
  })
})

describe('scanDirectory', () => {
  it('returns a ScanReport with correct shape', async () => {
    const report = await scanDirectory(FIXTURES_DIR, testMap)

    expect(report).toHaveProperty('totalFiles')
    expect(report).toHaveProperty('scannedFiles')
    expect(report).toHaveProperty('matches')
    expect(typeof report.totalFiles).toBe('number')
    expect(typeof report.scannedFiles).toBe('number')
    expect(Array.isArray(report.matches)).toBe(true)
  })

  it('filters files by supported extension list', async () => {
    const report = await scanDirectory(FIXTURES_DIR, testMap)

    // sample-project has: api.ts, app.py, clean.ts, config.yaml, settings.json
    // All have supported extensions
    expect(report.totalFiles).toBe(5)
  })

  it('skips files not matching the extension list', async () => {
    // Create a temporary directory with unsupported file types
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')

    const tempDir = await mkdtemp(join(tmpdir(), 'llm-scan-test-'))
    try {
      // Write a file with unsupported extension
      await writeFile(
        join(tempDir, 'readme.md'),
        'model: "gpt-4"\n',
      )
      // Write a file with supported extension
      await writeFile(
        join(tempDir, 'config.yaml'),
        'model: "gpt-4"\n',
      )

      const report = await scanDirectory(tempDir, testMap)

      // Only the .yaml file should count as a supported file
      expect(report.totalFiles).toBe(1)
      // The .md file should be skipped entirely
      expect(report.matches.every((m) => !m.file.endsWith('.md'))).toBe(true)
    } finally {
      await rm(tempDir, { recursive: true })
    }
  })

  it('applies two-pass strategy: prefix filter then precise scan', async () => {
    // clean.ts contains no model stems, so prefix filter should skip it.
    // The scannedFiles count should be less than totalFiles when some
    // files don't pass the prefix filter.
    const report = await scanDirectory(FIXTURES_DIR, testMap)

    // clean.ts has no model stems -> should not be scanned
    // 5 total files, 4 pass prefix filter (clean.ts is filtered out)
    expect(report.scannedFiles).toBeLessThan(report.totalFiles)
    expect(report.scannedFiles).toBe(4)
  })

  it('finds all 7 known model strings in sample-project', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    // 2 in api.ts + 2 in config.yaml + 2 in app.py + 1 in settings.json = 7
    expect(report.matches).toHaveLength(7)
  })

  it('reports correct match details from fixture files', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    const matchedTexts = report.matches.map((m) => m.matchedText).sort()
    const expected = [
      'claude-3-5-sonnet-20240620',
      'claude-3-haiku-20240307',
      'claude-3-opus-20240229',
      'gemini-pro',
      'gpt-3.5-turbo',
      'gpt-4',
      'gpt-4o-2024-05-13',
    ].sort()

    expect(matchedTexts).toEqual(expected)
  })

  it('reports correct file paths in matches', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    const files = new Set(report.matches.map((m) => m.file))
    expect(files).toContain('api.ts')
    expect(files).toContain('config.yaml')
    expect(files).toContain('app.py')
    expect(files).toContain('settings.json')
    expect(files).not.toContain('clean.ts')
  })

  it('produces zero matches for clean.ts content', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    const cleanMatches = report.matches.filter((m) => m.file === 'clean.ts')
    expect(cleanMatches).toHaveLength(0)
  })

  it('totalFiles counts only files with supported extensions', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    // sample-project has 5 files, all with supported extensions
    expect(report.totalFiles).toBe(5)
  })
})

describe('scanDirectory edge cases', () => {
  it('returns empty report for non-existent directory', async () => {
    const report = await scanDirectory('/tmp/does-not-exist-at-all', testMap)

    expect(report.totalFiles).toBe(0)
    expect(report.scannedFiles).toBe(0)
    expect(report.matches).toEqual([])
  })

  it('returns empty report for an empty directory', async () => {
    const { mkdtemp, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')

    const tempDir = await mkdtemp(join(tmpdir(), 'llm-scan-empty-'))
    try {
      const report = await scanDirectory(tempDir, testMap)

      expect(report.totalFiles).toBe(0)
      expect(report.scannedFiles).toBe(0)
      expect(report.matches).toEqual([])
    } finally {
      await rm(tempDir, { recursive: true })
    }
  })

  it('returns empty matches when upgrade map is empty', async () => {
    const emptyMap: UpgradeMap = {}
    const report = await scanDirectory(FIXTURES_DIR, emptyMap)

    // Files are still counted, but no matches since map is empty
    expect(report.totalFiles).toBe(5)
    expect(report.scannedFiles).toBe(0)
    expect(report.matches).toEqual([])
  })

  it('handles non-git directory with recursive walk fallback', async () => {
    // The sample-project fixtures are NOT in a git repo,
    // so this tests the fallback recursive walk path
    const report = await scanDirectory(FIXTURES_DIR, testMap)

    // Should still find files and scan them
    expect(report.totalFiles).toBe(5)
    expect(report.matches.length).toBeGreaterThan(0)
  })

  it('handles directory with nested subdirectories', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')

    const tempDir = await mkdtemp(join(tmpdir(), 'llm-scan-nested-'))
    try {
      // Create nested structure
      await mkdir(join(tempDir, 'src'), { recursive: true })
      await mkdir(join(tempDir, 'config'), { recursive: true })

      await writeFile(
        join(tempDir, 'src', 'api.ts'),
        'const MODEL = "gpt-4"\n',
      )
      await writeFile(
        join(tempDir, 'config', 'settings.yaml'),
        'model: "claude-3-opus-20240229"\n',
      )

      const report = await scanDirectory(tempDir, testMap)

      expect(report.totalFiles).toBe(2)
      expect(report.matches).toHaveLength(2)

      const matchedTexts = report.matches.map((m) => m.matchedText).sort()
      expect(matchedTexts).toEqual(['claude-3-opus-20240229', 'gpt-4'])
    } finally {
      await rm(tempDir, { recursive: true })
    }
  })

  it('skips ignored directories (node_modules, .git, dist, etc.)', async () => {
    const { mkdtemp, mkdir, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')

    const tempDir = await mkdtemp(join(tmpdir(), 'llm-scan-ignore-'))
    try {
      // Create an ignored directory with a model file
      await mkdir(join(tempDir, 'node_modules', 'some-pkg'), {
        recursive: true,
      })
      await writeFile(
        join(tempDir, 'node_modules', 'some-pkg', 'index.js'),
        'const MODEL = "gpt-4"\n',
      )

      // Create a normal file
      await writeFile(
        join(tempDir, 'app.ts'),
        'const MODEL = "gpt-4"\n',
      )

      const report = await scanDirectory(tempDir, testMap)

      // Only app.ts should be found, node_modules/some-pkg/index.js skipped
      expect(report.totalFiles).toBe(1)
      expect(report.matches).toHaveLength(1)
      expect(report.matches[0]?.file).toBe('app.ts')
    } finally {
      await rm(tempDir, { recursive: true })
    }
  })

  it('uses git ls-files when inside a git repo', async () => {
    const { mkdtemp, writeFile, rm } = await import('node:fs/promises')
    const { tmpdir } = await import('node:os')
    const { execSync } = await import('node:child_process')

    const tempDir = await mkdtemp(join(tmpdir(), 'llm-scan-git-'))
    try {
      // Initialize a git repo
      execSync('git init', { cwd: tempDir })
      execSync('git config user.email "test@test.com"', { cwd: tempDir })
      execSync('git config user.name "Test"', { cwd: tempDir })

      // Create and add a tracked file
      await writeFile(
        join(tempDir, 'tracked.ts'),
        'const MODEL = "gpt-4"\n',
      )
      execSync('git add tracked.ts', { cwd: tempDir })
      execSync('git commit -m "add tracked file"', { cwd: tempDir })

      // Create an untracked file (should be excluded by git ls-files)
      await writeFile(
        join(tempDir, 'untracked.ts'),
        'const BACKUP = "gpt-3.5-turbo"\n',
      )

      const report = await scanDirectory(tempDir, testMap)

      // Only tracked.ts should appear via git ls-files
      expect(report.totalFiles).toBe(1)
      expect(report.matches).toHaveLength(1)
      expect(report.matches[0]?.matchedText).toBe('gpt-4')
    } finally {
      await rm(tempDir, { recursive: true })
    }
  })

  it('file paths in matches are relative to the scanned directory', async () => {
    const map = await loadRealMap()
    const report = await scanDirectory(FIXTURES_DIR, map)

    // All file paths should be relative (not absolute)
    for (const match of report.matches) {
      expect(match.file).not.toContain(FIXTURES_DIR)
      expect(match.file.startsWith('/')).toBe(false)
    }
  })
})
