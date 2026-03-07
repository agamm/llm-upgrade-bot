export type {
  UpgradeEntry,
  UpgradeMap,
  ScanResult,
  ScanReport,
  FileEdit,
  Result,
} from './types.js'

export { loadUpgradeMap, lookupModel } from './upgrade-map.js'

export { buildPrefixRegex, fileMatchesPrefixFilter } from './prefix-filter.js'

export { scanFile } from './scanner.js'

export { scanDirectory, SUPPORTED_EXTENSIONS } from './directory-scanner.js'
export type { ScanOptions } from './directory-scanner.js'

export { computeEdits, applyFixes } from './fixer.js'
