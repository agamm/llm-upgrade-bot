export type {
  UpgradeEntry,
  UpgradeMap,
  ScanResult,
  ScanReport,
  FileEdit,
  Result,
  VariantRule,
  ProviderConfig,
} from './types.js'

export { loadUpgradeMap, lookupModel } from './upgrade-map.js'

export { buildPrefixRegex, fileMatchesPrefixFilter } from './prefix-filter.js'

export { scanFile } from './scanner.js'

export { scanDirectory, SUPPORTED_EXTENSIONS } from './directory-scanner.js'
export type { ScanOptions } from './directory-scanner.js'

export { computeEdits, applyFixes } from './fixer.js'

export {
  validateUpgradeMap,
  checkVariantConsistency,
  OPENROUTER_RULE,
} from './variant-validator.js'

export {
  fetchProviderModels,
  fetchAllProviderModels,
  filterChatModels,
  diffModels,
  PROVIDER_CONFIGS,
} from './model-discovery.js'

export { loadFamilies, allModelsInFamilies, findModelInFamilies } from './families.js'
export type { FamilyChain, FamiliesMap } from './families.js'

export { deriveUpgradeMap, PREFIX_RULES } from './derive-upgrades.js'
