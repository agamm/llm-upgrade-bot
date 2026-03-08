import { describe, it, expect, afterEach } from 'vitest'
import { execSync } from 'node:child_process'
import { mkdtemp, cp, readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import type { ScanReport } from '../../src/core/types.js'

const ROOT = join(import.meta.dirname, '..', '..')
const FIXTURE_DIR = join(ROOT, 'test', 'fixtures', 'sample-project')
const CLI = join(ROOT, 'src', 'cli', 'index.ts')

/**
 * Run the CLI via tsx (TypeScript executor) and return stdout.
 * Throws on non-zero exit unless `expectFail` is true.
 */
function runCli(
  args: string[],
  options?: { expectFail?: boolean },
): { stdout: string; exitCode: number } {
  const cmd = `npx tsx ${CLI} ${args.join(' ')}`
  try {
    const stdout = execSync(cmd, {
      cwd: ROOT,
      encoding: 'utf-8',
      env: { ...process.env, NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    return { stdout, exitCode: 0 }
  } catch (err: unknown) {
    if (
      options?.expectFail &&
      err !== null &&
      typeof err === 'object' &&
      'status' in err &&
      'stdout' in err
    ) {
      const execErr = err as { status: number; stdout: string }
      return { stdout: execErr.stdout, exitCode: execErr.status }
    }
    throw err
  }
}

// ─── Scan Mode ───────────────────────────────────────────────────────────────

describe('CLI scan mode', () => {
  it('produces output with model match info and exits code 1', () => {
    const { stdout, exitCode } = runCli([FIXTURE_DIR], { expectFail: true })

    // Should exit with code 1 (upgrades found)
    expect(exitCode).toBe(1)

    // Should contain matched model strings from the fixtures
    expect(stdout).toContain('gpt-4o-2024-05-13')
    expect(stdout).toContain('gpt-3.5-turbo')
    expect(stdout).toContain('claude-3-opus-20240229')
    expect(stdout).toContain('gpt-4')
    expect(stdout).toContain('gemini-pro')
    expect(stdout).toContain('claude-3-5-sonnet-20240620')

    // Should contain upgrade arrows
    expect(stdout).toContain('\u2192')

    // Should contain the summary line
    expect(stdout).toMatch(/Found \d+ upgradable models? in \d+ files?/)
  })

  it('shows safe and major upgrades where available', () => {
    const { stdout } = runCli([FIXTURE_DIR], { expectFail: true })

    // gpt-4o-2024-05-13 has both safe and major — check arrows exist
    expect(stdout).toContain('safe:')
    expect(stdout).toContain('major:')

    // Should show the matched model strings
    expect(stdout).toContain('gpt-4o-2024-05-13')
    expect(stdout).toContain('claude-3-opus-20240229')
  })

  it('shows file paths and line numbers', () => {
    const { stdout } = runCli([FIXTURE_DIR], { expectFail: true })

    // Should mention the fixture file names with line numbers
    expect(stdout).toMatch(/api\.ts:\d+/)
    expect(stdout).toMatch(/config\.yaml:\d+/)
    expect(stdout).toMatch(/app\.py:\d+/)
    expect(stdout).toMatch(/settings\.json:\d+/)
  })
})

// ─── Default Command ─────────────────────────────────────────────────────────

describe('CLI default command', () => {
  it('works without explicit subcommand', () => {
    // The default action should be scan — no "scan" subcommand needed
    const { stdout, exitCode } = runCli([FIXTURE_DIR], { expectFail: true })

    expect(exitCode).toBe(1)
    expect(stdout).toContain('gpt-4o-2024-05-13')
  })
})

// ─── Clean Scan ──────────────────────────────────────────────────────────────

describe('CLI clean scan', () => {
  let emptyDir: string

  afterEach(async () => {
    if (emptyDir) {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })

  it('exits with code 0 when no matches found', async () => {
    emptyDir = await mkdtemp(join(tmpdir(), 'cli-clean-'))
    // Create a file with no model strings
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(
      join(emptyDir, 'clean.ts'),
      'export const x = 42\n',
      'utf-8',
    )

    const { stdout, exitCode } = runCli([emptyDir])

    expect(exitCode).toBe(0)
    // Summary should indicate 0 matches
    expect(stdout).toMatch(/Found 0 upgradable models/)
  })
})

// ─── JSON Mode ───────────────────────────────────────────────────────────────

describe('CLI --json mode', () => {
  it('outputs valid JSON parseable as ScanReport', () => {
    const { stdout, exitCode } = runCli([FIXTURE_DIR, '--json'], {
      expectFail: true,
    })

    expect(exitCode).toBe(1)

    const report: ScanReport = JSON.parse(stdout)

    expect(report).toHaveProperty('totalFiles')
    expect(report).toHaveProperty('scannedFiles')
    expect(report).toHaveProperty('matches')
    expect(typeof report.totalFiles).toBe('number')
    expect(typeof report.scannedFiles).toBe('number')
    expect(Array.isArray(report.matches)).toBe(true)
    expect(report.matches.length).toBeGreaterThan(0)
  })

  it('each match has the correct ScanResult shape', () => {
    const { stdout } = runCli([FIXTURE_DIR, '--json'], { expectFail: true })
    const report: ScanReport = JSON.parse(stdout)

    for (const match of report.matches) {
      expect(match).toHaveProperty('file')
      expect(match).toHaveProperty('line')
      expect(match).toHaveProperty('column')
      expect(match).toHaveProperty('matchedText')
      expect(match).toHaveProperty('safeUpgrade')
      expect(match).toHaveProperty('majorUpgrade')
      expect(typeof match.file).toBe('string')
      expect(typeof match.line).toBe('number')
      expect(typeof match.column).toBe('number')
      expect(typeof match.matchedText).toBe('string')
    }
  })

  it('JSON output contains no ANSI color codes', () => {
    const { stdout } = runCli([FIXTURE_DIR, '--json'], { expectFail: true })

    // eslint-disable-next-line no-control-regex
    expect(stdout).not.toMatch(/\x1b\[/)
  })

  it('exits 0 with empty matches array for clean directory', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'cli-json-clean-'))
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(join(emptyDir, 'clean.ts'), 'export const x = 42\n', 'utf-8')

    try {
      const { stdout, exitCode } = runCli([emptyDir, '--json'])

      expect(exitCode).toBe(0)
      const report: ScanReport = JSON.parse(stdout)
      expect(report.matches).toEqual([])
    } finally {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })
})

// ─── PR Body Mode ───────────────────────────────────────────────────────────

describe('CLI --pr-body mode', () => {
  it('outputs markdown table with upgrade info and exits code 0', () => {
    const { stdout, exitCode } = runCli([FIXTURE_DIR, '--pr-body'])

    expect(exitCode).toBe(0)
    expect(stdout).toContain('## LLM Model Upgrades')
    expect(stdout).toContain('| File | Line | Model | Upgrade | Tier |')
    expect(stdout).toContain('api.ts')
    expect(stdout).toMatch(/\*\*\d+ upgrades? across \d+ files?\*\*/)
  })

  it('contains no ANSI color codes', () => {
    const { stdout } = runCli([FIXTURE_DIR, '--pr-body'])

    // eslint-disable-next-line no-control-regex
    expect(stdout).not.toMatch(/\x1b\[/)
  })

  it('exits 0 for clean directory', async () => {
    const emptyDir = await mkdtemp(join(tmpdir(), 'cli-pr-body-clean-'))
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(join(emptyDir, 'clean.ts'), 'export const x = 42\n', 'utf-8')

    try {
      const { stdout, exitCode } = runCli([emptyDir, '--pr-body'])

      expect(exitCode).toBe(0)
      expect(stdout).toContain('## LLM Model Upgrades')
      expect(stdout).toContain('**0 upgrades across 0 files**')
    } finally {
      await rm(emptyDir, { recursive: true, force: true })
    }
  })
})

// ─── Fix Mode ────────────────────────────────────────────────────────────────

describe('CLI --fix mode', () => {
  let tmpDir: string

  afterEach(async () => {
    if (tmpDir) {
      await rm(tmpDir, { recursive: true, force: true })
    }
  })

  it('modifies files correctly and outputs fix summary', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-fix-'))
    await cp(FIXTURE_DIR, tmpDir, { recursive: true })

    const { stdout, exitCode } = runCli([tmpDir, '--fix'])

    // Fix mode should exit 0 (fixes applied successfully)
    expect(exitCode).toBe(0)

    // Output should mention "Fixed" with count
    expect(stdout).toMatch(/Fixed \d+ models?/)

    // Verify api.ts was modified — old model strings replaced
    const apiContent = await readFile(join(tmpDir, 'api.ts'), 'utf-8')
    expect(apiContent).not.toContain('gpt-4o-2024-05-13')
    expect(apiContent).not.toContain('gpt-3.5-turbo')

    // Verify config.yaml was modified
    const configContent = await readFile(join(tmpDir, 'config.yaml'), 'utf-8')
    expect(configContent).not.toContain('claude-3-opus-20240229')

    // Verify app.py was modified
    const appContent = await readFile(join(tmpDir, 'app.py'), 'utf-8')
    expect(appContent).not.toContain("'gpt-4'")
    expect(appContent).not.toContain("'gemini-pro'")

    // Verify settings.json was modified
    const settingsContent = await readFile(
      join(tmpDir, 'settings.json'),
      'utf-8',
    )
    expect(settingsContent).not.toContain('claude-3-5-sonnet-20240620')

    // clean.ts should be unchanged
    const cleanContent = await readFile(join(tmpDir, 'clean.ts'), 'utf-8')
    expect(cleanContent).toContain('return a + b')
  })

  it('shows file paths in fix output', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-fix-paths-'))
    await cp(FIXTURE_DIR, tmpDir, { recursive: true })

    const { stdout } = runCli([tmpDir, '--fix'])

    // Should mention the modified files
    expect(stdout).toContain('api.ts')
    expect(stdout).toContain('config.yaml')
    expect(stdout).toContain('app.py')
    expect(stdout).toContain('settings.json')
  })

  it('exits 0 with no changes when directory is clean', async () => {
    tmpDir = await mkdtemp(join(tmpdir(), 'cli-fix-clean-'))
    const { writeFile: wf } = await import('node:fs/promises')
    await wf(join(tmpDir, 'clean.ts'), 'export const x = 42\n', 'utf-8')

    const { stdout, exitCode } = runCli([tmpDir, '--fix'])

    expect(exitCode).toBe(0)
    expect(stdout).toMatch(/Fixed 0 models/)
  })
})
