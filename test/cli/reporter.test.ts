import { describe, it, expect } from 'vitest'
import {
  formatScanReport,
  formatFixReport,
  buildFixEdits,
} from '../../src/cli/reporter.js'
import type { ScanReport, ScanResult } from '../../src/core/types.js'

describe('formatScanReport', () => {
  it('includes matched model strings in output', () => {
    const report: ScanReport = {
      totalFiles: 10,
      scannedFiles: 3,
      matches: [
        {
          file: 'api.ts',
          line: 5,
          column: 14,
          matchedText: 'gpt-4',
          safeUpgrade: null,
          majorUpgrade: 'gpt-4.1',
        },
      ],
    }

    const output = formatScanReport(report, 42)
    expect(output).toContain('gpt-4')
    expect(output).toContain('api.ts:5')
    expect(output).toContain('gpt-4.1')
  })

  it('pluralizes model/models and file/files correctly', () => {
    const single: ScanReport = {
      totalFiles: 1,
      scannedFiles: 1,
      matches: [
        {
          file: 'a.ts', line: 1, column: 0,
          matchedText: 'gpt-4', safeUpgrade: null, majorUpgrade: 'gpt-4.1',
        },
      ],
    }
    const multi: ScanReport = {
      totalFiles: 5,
      scannedFiles: 3,
      matches: [
        {
          file: 'a.ts', line: 1, column: 0,
          matchedText: 'gpt-4', safeUpgrade: null, majorUpgrade: 'gpt-4.1',
        },
        {
          file: 'b.ts', line: 1, column: 0,
          matchedText: 'gemini-pro', safeUpgrade: null, majorUpgrade: 'gemini-2.5-pro',
        },
      ],
    }

    expect(formatScanReport(single, 10)).toMatch(/1 upgradable model in 1 file/)
    expect(formatScanReport(multi, 10)).toMatch(/2 upgradable models in 2 files/)
  })

  it('shows zero matches summary for clean scan', () => {
    const report: ScanReport = {
      totalFiles: 5,
      scannedFiles: 0,
      matches: [],
    }

    const output = formatScanReport(report, 5)
    expect(output).toMatch(/Found 0 upgradable models/)
  })

  it('shows both safe and major arrows when both exist', () => {
    const report: ScanReport = {
      totalFiles: 1,
      scannedFiles: 1,
      matches: [
        {
          file: 'a.ts', line: 1, column: 0,
          matchedText: 'gpt-4o-2024-05-13',
          safeUpgrade: 'gpt-4o-2024-11-20',
          majorUpgrade: 'gpt-4.1',
        },
      ],
    }

    const output = formatScanReport(report, 10)
    expect(output).toContain('safe:')
    expect(output).toContain('major:')
    expect(output).toContain('gpt-4o-2024-11-20')
    expect(output).toContain('gpt-4.1')
  })

  it('includes duration in summary', () => {
    const report: ScanReport = {
      totalFiles: 1, scannedFiles: 1, matches: [],
    }
    const output = formatScanReport(report, 123)
    expect(output).toContain('123ms')
  })
})

describe('buildFixEdits', () => {
  it('prefers safe upgrade and labels tier correctly', () => {
    const matches: ScanResult[] = [
      {
        file: 'a.ts', line: 1, column: 0,
        matchedText: 'gpt-4o-2024-05-13',
        safeUpgrade: 'gpt-4o-2024-11-20',
        majorUpgrade: 'gpt-4.1',
      },
    ]

    const edits = buildFixEdits(matches)
    expect(edits).toHaveLength(1)
    expect(edits[0]?.newText).toBe('gpt-4o-2024-11-20')
    expect(edits[0]?.tier).toBe('safe')
  })

  it('uses major when safe is null and labels tier', () => {
    const matches: ScanResult[] = [
      {
        file: 'a.ts', line: 1, column: 0,
        matchedText: 'gpt-4',
        safeUpgrade: null,
        majorUpgrade: 'gpt-4.1',
      },
    ]

    const edits = buildFixEdits(matches)
    expect(edits[0]?.tier).toBe('major')
  })

  it('skips entries with no upgrades', () => {
    const matches: ScanResult[] = [
      {
        file: 'a.ts', line: 1, column: 0,
        matchedText: 'latest-model',
        safeUpgrade: null,
        majorUpgrade: null,
      },
    ]

    expect(buildFixEdits(matches)).toEqual([])
  })
})

describe('formatFixReport', () => {
  it('shows file path, old model, new model, and tier', () => {
    const output = formatFixReport(
      { applied: 1, files: ['api.ts'] },
      [{ file: 'api.ts', line: 5, oldText: 'gpt-4', newText: 'gpt-4.1', tier: 'major' as const }],
    )

    expect(output).toContain('api.ts:5')
    expect(output).toContain('gpt-4')
    expect(output).toContain('gpt-4.1')
    expect(output).toContain('major')
  })

  it('pluralizes model count', () => {
    const single = formatFixReport(
      { applied: 1, files: ['a.ts'] },
      [{ file: 'a.ts', line: 1, oldText: 'x', newText: 'y', tier: 'safe' as const }],
    )
    const multi = formatFixReport(
      { applied: 3, files: ['a.ts'] },
      [],
    )

    expect(single).toContain('1 model')
    expect(multi).toContain('3 models')
  })
})
