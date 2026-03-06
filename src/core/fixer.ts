import { readFile, writeFile } from 'node:fs/promises'
import type { ScanResult, FileEdit } from './types.js'

/**
 * Convert scan results to file edits using safe-first, major-fallback logic.
 * Skips results where both safe and major upgrades are null.
 */
export function computeEdits(matches: ScanResult[]): FileEdit[] {
  const edits: FileEdit[] = []

  for (const match of matches) {
    const newText = match.safeUpgrade ?? match.majorUpgrade
    if (newText === null) continue

    edits.push({
      file: match.file,
      line: match.line,
      column: match.column,
      oldText: match.matchedText,
      newText,
    })
  }

  return edits
}

/**
 * Group edits by their file path.
 */
function groupEditsByFile(edits: FileEdit[]): Map<string, FileEdit[]> {
  const byFile = new Map<string, FileEdit[]>()
  for (const edit of edits) {
    const group = byFile.get(edit.file)
    if (group) {
      group.push(edit)
    } else {
      byFile.set(edit.file, [edit])
    }
  }
  return byFile
}

/**
 * Apply file edits by reading each file, replacing matched text, and writing
 * back. Edits within a single file are applied bottom-to-top (highest line
 * and column first) to avoid offset corruption.
 */
export async function applyFixes(
  edits: FileEdit[],
): Promise<{ applied: number; files: string[] }> {
  if (edits.length === 0) {
    return { applied: 0, files: [] }
  }

  const byFile = groupEditsByFile(edits)
  let applied = 0
  const files: string[] = []

  for (const [filePath, fileEdits] of byFile) {
    const content = await readFile(filePath, 'utf-8')
    const { result: updated, appliedCount } = applyEditsToContent(content, fileEdits)
    await writeFile(filePath, updated, 'utf-8')

    applied += appliedCount
    if (appliedCount > 0) files.push(filePath)
  }

  return { applied, files }
}

/**
 * Apply a set of edits to file content. Sorts edits bottom-to-top
 * (descending by line, then descending by column) so that replacements
 * with different-length strings do not corrupt the positions of earlier edits.
 */
function applyEditsToContent(
  content: string,
  edits: FileEdit[],
): { result: string; appliedCount: number } {
  // Sort descending: highest line first, then highest column first
  const sorted = [...edits].sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line
    return b.column - a.column
  })

  const lines = content.split('\n')
  let appliedCount = 0

  for (const edit of sorted) {
    const lineIndex = edit.line - 1 // 1-based to 0-based
    const line = lines[lineIndex]
    if (line === undefined) continue

    const col = edit.column
    const before = line.slice(0, col)
    const quoteChar = line[col]
    const afterQuote = line.slice(col + 1)

    // The oldText should appear right after the opening quote
    if (quoteChar && afterQuote.startsWith(edit.oldText)) {
      lines[lineIndex] =
        before + quoteChar + edit.newText + afterQuote.slice(edit.oldText.length)
      appliedCount++
    }
  }

  return { result: lines.join('\n'), appliedCount }
}
