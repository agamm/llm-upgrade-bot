import { Command } from 'commander'
import { resolve } from 'node:path'
import { performance } from 'node:perf_hooks'
import { loadUpgradeMap } from '../core/upgrade-map.js'
import { scanDirectory } from '../core/directory-scanner.js'
import { computeEdits, applyFixes } from '../core/fixer.js'
import {
  formatScanReport,
  formatFixReport,
  formatPrBody,
  buildFixEdits,
} from './reporter.js'

export const program = new Command()

program
  .name('llm-upgrade-bot')
  .description(
    'Scan codebases for outdated LLM model strings and propose upgrades',
  )
  .version('0.1.0')

program
  .argument('[directory]', 'directory to scan', '.')
  .option('--fix', 'auto-apply upgrades to files')
  .option('--json', 'output results as JSON')
  .option('--pr-body', 'output markdown PR body for upgrade matches')
  .option('--extensions <exts>', 'extra file extensions to scan (comma-separated, e.g. ".txt,.cfg")')
  .action(async (directory: string, options: { fix?: boolean; json?: boolean; prBody?: boolean; extensions?: string }) => {
    const dir = resolve(directory)
    await runScan(dir, options)
  })

function parseExtensions(raw?: string): string[] {
  if (!raw) return []
  return raw.split(',').map((e) => e.trim()).map((e) =>
    e.startsWith('.') ? e : `.${e}`,
  )
}

async function runScan(
  dir: string,
  options: { fix?: boolean; json?: boolean; prBody?: boolean; extensions?: string },
): Promise<void> {
  const mapResult = await loadUpgradeMap()
  if (!mapResult.ok) {
    process.stderr.write(`Error: ${mapResult.error}\n`)
    process.exit(2)
    return
  }

  const upgradeMap = mapResult.data
  const extraExtensions = parseExtensions(options.extensions)
  const start = performance.now()
  const report = await scanDirectory(dir, upgradeMap, { extraExtensions })
  const durationMs = Math.round(performance.now() - start)

  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + '\n')
    process.exit(report.matches.length > 0 ? 1 : 0)
    return
  }

  if (options.prBody) {
    process.stdout.write(formatPrBody(report))
    process.exit(0)
    return
  }

  if (options.fix) {
    const fixEdits = buildFixEdits(report.matches)
    const edits = computeEdits(report.matches)
    const result = await applyFixes(
      edits.map((e) => ({ ...e, file: resolve(dir, e.file) })),
    )
    process.stdout.write(formatFixReport(result, fixEdits))
    process.exit(0)
    return
  }

  // Default: scan report
  process.stdout.write(formatScanReport(report, durationMs))
  process.exit(report.matches.length > 0 ? 1 : 0)
}

// Run when executed directly (bin entry point or tsx dev)
const isDirectRun =
  process.argv[1] !== undefined &&
  /cli(?:\/index)?(?:\.ts|\.js)$/.test(process.argv[1])

if (isDirectRun) {
  program.parseAsync()
}
