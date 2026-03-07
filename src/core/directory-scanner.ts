import { readFile, readdir, stat } from 'node:fs/promises'
import { join, extname, relative } from 'node:path'
import { execSync } from 'node:child_process'
import type { UpgradeMap, ScanReport, ScanResult } from './types.js'
import { buildPrefixRegex, fileMatchesPrefixFilter } from './prefix-filter.js'
import { scanFile } from './scanner.js'

/**
 * File extensions supported for scanning.
 */
export const SUPPORTED_EXTENSIONS: readonly string[] = Object.freeze([
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
  // Docs / content
  '.md', '.mdx',
  // Config / data
  '.yaml', '.yml', '.json', '.toml',
  '.env', '.cfg', '.ini',
  // Infrastructure
  '.tf', '.hcl',
])

/**
 * Directories to skip during recursive file walking (non-git fallback).
 */
const IGNORED_DIRS = new Set([
  'node_modules', '.git', 'dist', 'build', 'vendor',
  '__pycache__', '.venv', 'coverage', '.next', '.nuxt',
])

export interface ScanOptions {
  extraExtensions?: string[]
}

/**
 * Check if a file has a supported extension.
 */
function hasSupportedExtension(
  filePath: string,
  extra: string[] = [],
): boolean {
  const ext = extname(filePath)
  return SUPPORTED_EXTENSIONS.includes(ext) || extra.includes(ext)
}

/**
 * Try to list tracked files using `git ls-files`.
 * Returns null if the directory is not a git repository or if
 * no tracked files exist (e.g. untracked subdirectory of a repo).
 */
function tryGitLsFiles(dir: string): string[] | null {
  try {
    const output = execSync('git ls-files', {
      cwd: dir,
      encoding: 'utf-8',
      stdio: ['pipe', 'pipe', 'pipe'],
    })
    const files = output
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0)

    // Fall back to walk if git returns no tracked files
    return files.length > 0 ? files : null
  } catch {
    return null
  }
}

/**
 * Recursively walk a directory and collect file paths relative to the root.
 * Skips directories in the IGNORED_DIRS set.
 */
async function walkDirectory(dir: string, root: string): Promise<string[]> {
  let names: string[]
  try {
    names = await readdir(dir)
  } catch {
    return []
  }

  const files: string[] = []
  for (const name of names) {
    const fullPath = join(dir, name)
    const fileStat = await stat(fullPath).catch(() => null)
    if (!fileStat) continue

    if (fileStat.isDirectory() && !IGNORED_DIRS.has(name)) {
      files.push(...(await walkDirectory(fullPath, root)))
    } else if (fileStat.isFile()) {
      files.push(relative(root, fullPath))
    }
  }
  return files
}

/**
 * Check if a directory exists and is accessible.
 */
async function directoryExists(dir: string): Promise<boolean> {
  try {
    const s = await stat(dir)
    return s.isDirectory()
  } catch {
    return false
  }
}

/**
 * List supported files in a directory using git or fallback walk.
 */
async function listSupportedFiles(
  dir: string,
  extra: string[] = [],
): Promise<string[]> {
  const allFiles = tryGitLsFiles(dir) ?? (await walkDirectory(dir, dir))
  return allFiles.filter((f) => hasSupportedExtension(f, extra))
}

/**
 * Two-pass scan: prefix filter then precise scan on each file.
 * Returns the number of files scanned and all matches found.
 */
async function twoPassScan(
  dir: string,
  files: string[],
  upgradeMap: UpgradeMap,
  prefixRegex: RegExp,
): Promise<{ scannedFiles: number; matches: ScanResult[] }> {
  const matches: ScanResult[] = []
  let scannedFiles = 0

  for (const filePath of files) {
    const content = await readFileSafe(join(dir, filePath))
    if (content === null) continue

    if (!fileMatchesPrefixFilter(content, prefixRegex)) continue
    scannedFiles++

    matches.push(...scanFile(filePath, content, upgradeMap))
  }

  return { scannedFiles, matches }
}

/**
 * Read a file safely, returning null on error.
 */
async function readFileSafe(path: string): Promise<string | null> {
  try {
    return await readFile(path, 'utf-8')
  } catch {
    return null
  }
}

/**
 * Scan a directory for hardcoded LLM model strings using a two-pass strategy:
 * 1. Prefix filter: skip files with no provider stems
 * 2. Precise scan: extract quoted strings and look up in upgrade map
 *
 * Uses `git ls-files` to list tracked files in git repos.
 * Falls back to recursive directory walk for non-git directories.
 */
export async function scanDirectory(
  dir: string,
  upgradeMap: UpgradeMap,
  options?: ScanOptions,
): Promise<ScanReport> {
  const empty: ScanReport = {
    totalFiles: 0, scannedFiles: 0, matches: [],
  }

  if (!(await directoryExists(dir))) return empty

  const extra = options?.extraExtensions ?? []
  const supportedFiles = await listSupportedFiles(dir, extra)
  const prefixRegex = buildPrefixRegex(upgradeMap)
  const { scannedFiles, matches } = await twoPassScan(
    dir, supportedFiles, upgradeMap, prefixRegex,
  )

  return { totalFiles: supportedFiles.length, scannedFiles, matches }
}
