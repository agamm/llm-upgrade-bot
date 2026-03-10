import type { UpgradeMap, ScanResult } from './types.js'

/**
 * Regex to extract strings from source code.
 * Group 1: double-quoted strings  "model-id"
 * Group 2: single-quoted strings  'model-id'
 * Group 3: backtick strings       `model-id`  (Go raw strings, JS template literals)
 */
const QUOTED_STRING_REGEX = /"([^"]+)"|'([^']+)'/g
const BACKTICK_REGEX = /`([^`]+)`/g
/** Matches bare tokens that could be model IDs (for markdown files). */
const BARE_TOKEN_REGEX = /[a-zA-Z][a-zA-Z0-9\-._/]+[a-zA-Z0-9]/g

/**
 * Scan file content for hardcoded LLM model strings and look them up
 * in the upgrade map.
 *
 * @param filePath - The file path (used in ScanResult.file)
 * @param content - The file content to scan
 * @param upgradeMap - The upgrade map to look up model IDs
 * @returns Array of ScanResult for each matched model string
 */
/** Strip OpenRouter colon tag (:free, :exacto, :nitro) from model ID.
 *  Returns null if no tag found or if tag is a numeric suffix like Bedrock ":0". */
function stripColonTag(id: string): { base: string; tag: string } | null {
  const colonIdx = id.lastIndexOf(':')
  if (colonIdx <= 0) return null
  const tag = id.slice(colonIdx)
  if (/^:\d+$/.test(tag)) return null
  return { base: id.slice(0, colonIdx), tag }
}

/**
 * Try to convert a regex match into a ScanResult by looking up the
 * matched model ID in the upgrade map.
 */
function matchToResult(
  match: RegExpExecArray,
  filePath: string,
  lineOffsets: number[],
  upgradeMap: UpgradeMap,
): ScanResult | undefined {
  const modelId = match[1] ?? match[2]
  if (!modelId) return undefined

  // Try exact match first (handles Bedrock ":0" suffixes)
  let entry = upgradeMap[modelId]
  let colonTag = ''

  // If no exact match, try stripping colon tag (OpenRouter :free, :exacto, etc.)
  if (!entry) {
    const stripped = stripColonTag(modelId)
    if (stripped) {
      entry = upgradeMap[stripped.base]
      if (entry) colonTag = stripped.tag
    }
  }

  if (!entry) return undefined

  const { line, column } = resolvePosition(lineOffsets, match.index)
  return {
    file: filePath,
    line,
    column,
    matchedText: modelId,
    safeUpgrade: entry.safe ? entry.safe + colonTag : null,
    majorUpgrade: entry.major ? entry.major + colonTag : null,
  }
}

/**
 * Run a regex against content and collect ScanResults for model matches.
 */
function collectMatches(
  regex: RegExp,
  content: string,
  filePath: string,
  lineOffsets: number[],
  upgradeMap: UpgradeMap,
): ScanResult[] {
  const results: ScanResult[] = []
  regex.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = regex.exec(content)) !== null) {
    const result = matchToResult(match, filePath, lineOffsets, upgradeMap)
    if (result) results.push(result)
  }
  return results
}

function isMarkdownFile(filePath: string): boolean {
  return filePath.endsWith('.md') || filePath.endsWith('.mdx')
}

/** Characters that indicate a template placeholder or quoted context. */
const SKIP_BEFORE = new Set(['{', '"', "'", '`'])
const SKIP_AFTER = new Set(['}', '"', "'", '`'])

/**
 * Scan for bare (unquoted) model names in markdown files.
 * Skips tokens inside quotes or curly braces (template placeholders).
 */
function collectBareMatches(
  content: string,
  filePath: string,
  lineOffsets: number[],
  upgradeMap: UpgradeMap,
): ScanResult[] {
  const results: ScanResult[] = []
  BARE_TOKEN_REGEX.lastIndex = 0
  let match: RegExpExecArray | null
  while ((match = BARE_TOKEN_REGEX.exec(content)) !== null) {
    const token = match[0]
    const entry = upgradeMap[token]
    if (!entry) continue
    const before = match.index > 0 ? content[match.index - 1] : ''
    const after = content[match.index + token.length] ?? ''
    if (SKIP_BEFORE.has(before ?? '')) continue
    if (SKIP_AFTER.has(after ?? '')) continue
    const { line, column } = resolvePosition(lineOffsets, match.index)
    results.push({
      file: filePath, line, column,
      matchedText: token,
      safeUpgrade: entry.safe,
      majorUpgrade: entry.major,
    })
  }
  return results
}

export function scanFile(
  filePath: string,
  content: string,
  upgradeMap: UpgradeMap,
): ScanResult[] {
  const lineOffsets = buildLineOffsets(content)
  const results = collectMatches(
    QUOTED_STRING_REGEX, content, filePath, lineOffsets, upgradeMap,
  )
  results.push(...collectMatches(
    BACKTICK_REGEX, content, filePath, lineOffsets, upgradeMap,
  ))
  if (isMarkdownFile(filePath)) {
    results.push(...collectBareMatches(
      content, filePath, lineOffsets, upgradeMap,
    ))
  }
  return results
}

/**
 * Build an array of byte offsets where each line starts.
 * Index 0 = line 1 starts at offset 0, etc.
 */
function buildLineOffsets(content: string): number[] {
  const offsets: number[] = [0]
  for (let i = 0; i < content.length; i++) {
    if (content[i] === '\n') {
      offsets.push(i + 1)
    }
  }
  return offsets
}

/**
 * Convert a character offset into a 1-based line and 0-based column.
 */
function resolvePosition(
  lineOffsets: number[],
  offset: number,
): { line: number; column: number } {
  // Binary search for the line containing this offset
  let low = 0
  let high = lineOffsets.length - 1

  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    const midOffset = lineOffsets[mid]
    if (midOffset !== undefined && midOffset <= offset) {
      low = mid
    } else {
      high = mid - 1
    }
  }

  const lineStart = lineOffsets[low] ?? 0
  return {
    line: low + 1, // 1-based
    column: offset - lineStart, // 0-based
  }
}
