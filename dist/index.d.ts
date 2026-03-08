interface UpgradeEntry {
    safe: string | null;
    major: string | null;
}
type UpgradeMap = Record<string, UpgradeEntry>;
interface ScanResult {
    file: string;
    line: number;
    column: number;
    matchedText: string;
    safeUpgrade: string | null;
    majorUpgrade: string | null;
}
interface ScanReport {
    totalFiles: number;
    scannedFiles: number;
    matches: ScanResult[];
}
interface FileEdit {
    file: string;
    line: number;
    column: number;
    oldText: string;
    newText: string;
}
type Result<T, E = string> = {
    ok: true;
    data: T;
} | {
    ok: false;
    error: E;
};
interface VariantRule {
    name: string;
    pattern: RegExp;
    extractNative: (variantKey: string) => string | null;
}
interface ProviderConfig {
    name: string;
    url: string;
    envVar: string;
    authStyle: 'bearer' | 'x-api-key' | 'query-param';
    extractIds: (body: unknown) => string[];
}

interface LoadOptions {
    url?: string;
    fallbackPath?: string;
}
declare function loadUpgradeMap(options?: LoadOptions): Promise<Result<UpgradeMap>>;
declare function lookupModel(map: UpgradeMap, modelId: string): UpgradeEntry | undefined;

/**
 * Build a single RegExp that matches any provider stem derived from the
 * upgrade map keys. Used as a fast first-pass filter to skip files that
 * contain no LLM model references.
 *
 * Strategy: for each key, extract the prefix up to and including the first
 * `-`, `/`, or `.`. Deduplicate, escape for regex, and join with `|`.
 */
declare function buildPrefixRegex(map: UpgradeMap): RegExp;
/**
 * Fast check: does this file content contain any provider stem?
 * Returns true if the content matches the prefix regex, false otherwise.
 */
declare function fileMatchesPrefixFilter(content: string, prefixRegex: RegExp): boolean;

declare function scanFile(filePath: string, content: string, upgradeMap: UpgradeMap): ScanResult[];

/**
 * File extensions supported for scanning.
 */
declare const SUPPORTED_EXTENSIONS: readonly string[];
interface ScanOptions {
    extraExtensions?: string[];
}
/**
 * Scan a directory for hardcoded LLM model strings using a two-pass strategy:
 * 1. Prefix filter: skip files with no provider stems
 * 2. Precise scan: extract quoted strings and look up in upgrade map
 *
 * Uses `git ls-files` to list tracked files in git repos.
 * Falls back to recursive directory walk for non-git directories.
 */
declare function scanDirectory(dir: string, upgradeMap: UpgradeMap, options?: ScanOptions): Promise<ScanReport>;

/**
 * Convert scan results to file edits using safe-first, major-fallback logic.
 * Skips results where both safe and major upgrades are null.
 */
declare function computeEdits(matches: ScanResult[]): FileEdit[];
/**
 * Apply file edits by reading each file, replacing matched text, and writing
 * back. Edits within a single file are applied bottom-to-top (highest line
 * and column first) to avoid offset corruption.
 */
declare function applyFixes(edits: FileEdit[]): Promise<{
    applied: number;
    files: string[];
}>;

declare function checkVariantConsistency(map: UpgradeMap, rules: VariantRule[]): string[];
declare const OPENROUTER_RULE: VariantRule;
declare function validateUpgradeMap(map: UpgradeMap, rules?: VariantRule[]): Result<void, string[]>;

interface ProposedEntry {
    key: string;
    entry: UpgradeEntry;
    confidence: 'auto' | 'suggested' | 'unknown';
    reason: string;
    sources: string[];
}
declare const PROVIDER_CONFIGS: ProviderConfig[];
declare function fetchProviderModels(config: ProviderConfig): Promise<Result<string[]>>;
declare function fetchAllProviderModels(configs?: ProviderConfig[]): Promise<{
    models: Record<string, Set<string>>;
    skipped: string[];
}>;
declare function filterChatModels(ids: string[]): string[];
declare function diffModels(knownKeys: Set<string>, discovered: string[]): string[];
declare function detectSafeUpgrades(newIds: string[], map: UpgradeMap, sourceMap?: Map<string, string[]>): ProposedEntry[];
declare function suggestMajorUpgrades(newIds: string[], map: UpgradeMap, sourceMap?: Map<string, string[]>): ProposedEntry[];
declare function generateReport(proposed: ProposedEntry[], skipped: string[]): string;

export { type FileEdit, OPENROUTER_RULE, PROVIDER_CONFIGS, type ProposedEntry, type ProviderConfig, type Result, SUPPORTED_EXTENSIONS, type ScanOptions, type ScanReport, type ScanResult, type UpgradeEntry, type UpgradeMap, type VariantRule, applyFixes, buildPrefixRegex, checkVariantConsistency, computeEdits, detectSafeUpgrades, diffModels, fetchAllProviderModels, fetchProviderModels, fileMatchesPrefixFilter, filterChatModels, generateReport, loadUpgradeMap, lookupModel, scanDirectory, scanFile, suggestMajorUpgrades, validateUpgradeMap };
