// src/core/upgrade-map.ts
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
function resolveDefaultPaths() {
  const dir = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  return [
    join(dir, "..", "..", "data", "upgrades.json"),
    join(dir, "..", "data", "upgrades.json")
  ];
}
var DEFAULT_UPGRADE_PATHS = resolveDefaultPaths();
function parseUpgradeMap(text) {
  let parsed;
  try {
    parsed = JSON.parse(text);
  } catch {
    return { ok: false, error: "Failed to parse JSON: invalid syntax" };
  }
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    return { ok: false, error: "Failed to parse JSON: expected an object" };
  }
  const data = parsed;
  delete data["_pinned"];
  return { ok: true, data };
}
async function loadFromFile(path) {
  let text;
  try {
    text = await readFile(path, "utf-8");
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown file read error";
    return { ok: false, error: `Failed to read file: ${message}` };
  }
  return parseUpgradeMap(text);
}
async function loadFromUrl(url) {
  let response;
  try {
    response = await fetch(url);
  } catch (err) {
    const message = err instanceof Error ? err.message : "Unknown fetch error";
    return { ok: false, error: `Failed to fetch URL: ${message}` };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `Failed to fetch URL: HTTP ${String(response.status)}`
    };
  }
  const text = await response.text();
  return parseUpgradeMap(text);
}
async function loadFromPaths(paths) {
  let lastError = "No fallback paths configured";
  for (const path of paths) {
    const result = await loadFromFile(path);
    if (result.ok) return result;
    lastError = result.error;
  }
  return { ok: false, error: lastError };
}
async function loadUpgradeMap(options) {
  const fallbackPaths = options?.fallbackPath ? [options.fallbackPath] : DEFAULT_UPGRADE_PATHS;
  const url = options?.url;
  if (url) {
    const result = await loadFromUrl(url);
    if (result.ok) return result;
    return loadFromPaths(fallbackPaths);
  }
  return loadFromPaths(fallbackPaths);
}
function lookupModel(map, modelId) {
  return map[modelId];
}

// src/core/prefix-filter.ts
var STEM_SEPARATORS = /[-/.]/;
function extractStem(key) {
  const match = STEM_SEPARATORS.exec(key);
  if (!match || match.index === void 0) return void 0;
  return key.slice(0, match.index + 1);
}
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildPrefixRegex(map) {
  const stems = /* @__PURE__ */ new Set();
  for (const key of Object.keys(map)) {
    const stem = extractStem(key);
    if (stem) stems.add(stem);
  }
  if (stems.size === 0) {
    return /(?!)/;
  }
  const escaped = [...stems].map(escapeRegex);
  return new RegExp(escaped.join("|"));
}
function fileMatchesPrefixFilter(content, prefixRegex) {
  return prefixRegex.test(content);
}

// src/core/scanner.ts
var QUOTED_STRING_REGEX = /"([^"]+)"|'([^']+)'/g;
var BACKTICK_REGEX = /`([^`]+)`/g;
var BARE_TOKEN_REGEX = /[a-zA-Z][a-zA-Z0-9\-._/]+[a-zA-Z0-9]/g;
function matchToResult(match, filePath, lineOffsets, upgradeMap) {
  const modelId = match[1] ?? match[2];
  if (!modelId) return void 0;
  const entry = upgradeMap[modelId];
  if (!entry) return void 0;
  const { line, column } = resolvePosition(lineOffsets, match.index);
  return {
    file: filePath,
    line,
    column,
    matchedText: modelId,
    safeUpgrade: entry.safe,
    majorUpgrade: entry.major
  };
}
function collectMatches(regex, content, filePath, lineOffsets, upgradeMap) {
  const results = [];
  regex.lastIndex = 0;
  let match;
  while ((match = regex.exec(content)) !== null) {
    const result = matchToResult(match, filePath, lineOffsets, upgradeMap);
    if (result) results.push(result);
  }
  return results;
}
function isMarkdownFile(filePath) {
  return filePath.endsWith(".md") || filePath.endsWith(".mdx");
}
var SKIP_BEFORE = /* @__PURE__ */ new Set(["{", '"', "'", "`"]);
var SKIP_AFTER = /* @__PURE__ */ new Set(["}", '"', "'", "`"]);
function collectBareMatches(content, filePath, lineOffsets, upgradeMap) {
  const results = [];
  BARE_TOKEN_REGEX.lastIndex = 0;
  let match;
  while ((match = BARE_TOKEN_REGEX.exec(content)) !== null) {
    const token = match[0];
    const entry = upgradeMap[token];
    if (!entry) continue;
    const before = match.index > 0 ? content[match.index - 1] : "";
    const after = content[match.index + token.length] ?? "";
    if (SKIP_BEFORE.has(before ?? "")) continue;
    if (SKIP_AFTER.has(after ?? "")) continue;
    const { line, column } = resolvePosition(lineOffsets, match.index);
    results.push({
      file: filePath,
      line,
      column,
      matchedText: token,
      safeUpgrade: entry.safe,
      majorUpgrade: entry.major
    });
  }
  return results;
}
function scanFile(filePath, content, upgradeMap) {
  const lineOffsets = buildLineOffsets(content);
  const results = collectMatches(
    QUOTED_STRING_REGEX,
    content,
    filePath,
    lineOffsets,
    upgradeMap
  );
  results.push(...collectMatches(
    BACKTICK_REGEX,
    content,
    filePath,
    lineOffsets,
    upgradeMap
  ));
  if (isMarkdownFile(filePath)) {
    results.push(...collectBareMatches(
      content,
      filePath,
      lineOffsets,
      upgradeMap
    ));
  }
  return results;
}
function buildLineOffsets(content) {
  const offsets = [0];
  for (let i = 0; i < content.length; i++) {
    if (content[i] === "\n") {
      offsets.push(i + 1);
    }
  }
  return offsets;
}
function resolvePosition(lineOffsets, offset) {
  let low = 0;
  let high = lineOffsets.length - 1;
  while (low < high) {
    const mid = Math.ceil((low + high) / 2);
    const midOffset = lineOffsets[mid];
    if (midOffset !== void 0 && midOffset <= offset) {
      low = mid;
    } else {
      high = mid - 1;
    }
  }
  const lineStart = lineOffsets[low] ?? 0;
  return {
    line: low + 1,
    // 1-based
    column: offset - lineStart
    // 0-based
  };
}

// src/core/directory-scanner.ts
import { readFile as readFile2, readdir, stat } from "fs/promises";
import { join as join2, extname, relative, basename } from "path";
import { execSync } from "child_process";
var SUPPORTED_EXTENSIONS = Object.freeze([
  ".py",
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".rb",
  ".php",
  ".lua",
  ".go",
  ".java",
  ".rs",
  ".cs",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  ".kt",
  ".kts",
  ".swift",
  ".dart",
  ".scala",
  ".sh",
  ".bash",
  ".zsh",
  ".ex",
  ".exs",
  ".r",
  ".R",
  ".vue",
  ".svelte",
  ".md",
  ".mdx",
  ".yaml",
  ".yml",
  ".json",
  ".toml",
  ".env",
  ".cfg",
  ".ini",
  ".tf",
  ".hcl"
]);
var IGNORED_DIRS = /* @__PURE__ */ new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "vendor",
  "__pycache__",
  ".venv",
  "coverage",
  ".next",
  ".nuxt"
]);
var TEST_DIRS = /* @__PURE__ */ new Set([
  "test",
  "tests",
  "__tests__",
  "spec",
  "specs",
  "test_data",
  "testdata",
  "test-data",
  "fixtures",
  "__fixtures__",
  "__mocks__"
]);
var TEST_FILE_PATTERN = /\.(?:test|spec)\.\w+$|^test_.*\.py$|_(?:test|spec)\.\w+$|(?:Test|Spec)\.(?:java|kt|scala|swift)$/;
function hasSupportedExtension(filePath, extra = []) {
  const ext = extname(filePath);
  return SUPPORTED_EXTENSIONS.includes(ext) || extra.includes(ext);
}
function tryGitLsFiles(dir) {
  try {
    const output = execSync("git ls-files", {
      cwd: dir,
      encoding: "utf-8",
      stdio: ["pipe", "pipe", "pipe"]
    });
    const files = output.split("\n").map((line) => line.trim()).filter((line) => line.length > 0);
    return files.length > 0 ? files : null;
  } catch {
    return null;
  }
}
async function walkDirectory(dir, root) {
  let names;
  try {
    names = await readdir(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names) {
    const fullPath = join2(dir, name);
    const fileStat = await stat(fullPath).catch(() => null);
    if (!fileStat) continue;
    if (fileStat.isDirectory() && !IGNORED_DIRS.has(name)) {
      files.push(...await walkDirectory(fullPath, root));
    } else if (fileStat.isFile()) {
      files.push(relative(root, fullPath));
    }
  }
  return files;
}
async function directoryExists(dir) {
  try {
    const s = await stat(dir);
    return s.isDirectory();
  } catch {
    return false;
  }
}
function matchGlob(filePath, pattern) {
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "{{GLOBSTAR}}").replace(/\*/g, "[^/]*").replace(/{{GLOBSTAR}}/g, ".*") + "$"
  );
  return regex.test(filePath) || regex.test(basename(filePath));
}
function isTestPath(filePath) {
  const segments = filePath.split("/");
  if (segments.some((s) => TEST_DIRS.has(s))) return true;
  const file = segments[segments.length - 1] ?? "";
  return TEST_FILE_PATTERN.test(file);
}
async function listSupportedFiles(dir, extra = [], skipTests = true) {
  const allFiles = tryGitLsFiles(dir) ?? await walkDirectory(dir, dir);
  return allFiles.filter(
    (f) => hasSupportedExtension(f, extra) && (!skipTests || !isTestPath(f))
  );
}
async function twoPassScan(dir, files, upgradeMap, prefixRegex) {
  const matches = [];
  let scannedFiles = 0;
  for (const filePath of files) {
    const content = await readFileSafe(join2(dir, filePath));
    if (content === null) continue;
    if (!fileMatchesPrefixFilter(content, prefixRegex)) continue;
    scannedFiles++;
    matches.push(...scanFile(filePath, content, upgradeMap));
  }
  return { scannedFiles, matches };
}
async function readFileSafe(path) {
  try {
    return await readFile2(path, "utf-8");
  } catch {
    return null;
  }
}
async function scanDirectory(dir, upgradeMap, options) {
  const empty = {
    totalFiles: 0,
    scannedFiles: 0,
    matches: []
  };
  if (!await directoryExists(dir)) return empty;
  const extra = options?.extraExtensions ?? [];
  const includeGlobs = options?.includeGlobs ?? [];
  const skipTests = includeGlobs.length === 0;
  let supportedFiles = await listSupportedFiles(dir, extra, skipTests);
  if (includeGlobs.length > 0) {
    supportedFiles = supportedFiles.filter(
      (f) => includeGlobs.some((g) => matchGlob(f, g))
    );
  }
  const prefixRegex = buildPrefixRegex(upgradeMap);
  const { scannedFiles, matches } = await twoPassScan(
    dir,
    supportedFiles,
    upgradeMap,
    prefixRegex
  );
  return { totalFiles: supportedFiles.length, scannedFiles, matches };
}

// src/core/fixer.ts
import { readFile as readFile3, writeFile } from "fs/promises";
function computeEdits(matches) {
  const edits = [];
  for (const match of matches) {
    const newText = match.safeUpgrade ?? match.majorUpgrade;
    if (newText === null) continue;
    edits.push({
      file: match.file,
      line: match.line,
      column: match.column,
      oldText: match.matchedText,
      newText
    });
  }
  return edits;
}
function groupEditsByFile(edits) {
  const byFile = /* @__PURE__ */ new Map();
  for (const edit of edits) {
    const group = byFile.get(edit.file);
    if (group) {
      group.push(edit);
    } else {
      byFile.set(edit.file, [edit]);
    }
  }
  return byFile;
}
async function applyFixes(edits) {
  if (edits.length === 0) {
    return { applied: 0, files: [] };
  }
  const byFile = groupEditsByFile(edits);
  let applied = 0;
  const files = [];
  for (const [filePath, fileEdits] of byFile) {
    const content = await readFile3(filePath, "utf-8");
    const { result: updated, appliedCount } = applyEditsToContent(content, fileEdits);
    await writeFile(filePath, updated, "utf-8");
    applied += appliedCount;
    if (appliedCount > 0) files.push(filePath);
  }
  return { applied, files };
}
function applyEditsToContent(content, edits) {
  const sorted = [...edits].sort((a, b) => {
    if (a.line !== b.line) return b.line - a.line;
    return b.column - a.column;
  });
  const lines = content.split("\n");
  let appliedCount = 0;
  for (const edit of sorted) {
    const lineIndex = edit.line - 1;
    const line = lines[lineIndex];
    if (line === void 0) continue;
    const col = edit.column;
    const before = line.slice(0, col);
    const quoteChar = line[col];
    const afterQuote = line.slice(col + 1);
    if (quoteChar && afterQuote.startsWith(edit.oldText)) {
      lines[lineIndex] = before + quoteChar + edit.newText + afterQuote.slice(edit.oldText.length);
      appliedCount++;
    }
  }
  return { result: lines.join("\n"), appliedCount };
}

// src/core/variant-validator.ts
function checkVariantConsistency(map, rules) {
  const errors = [];
  for (const [variantKey, entry] of Object.entries(map)) {
    for (const rule of rules) {
      if (!rule.pattern.test(variantKey)) continue;
      const nativeId = rule.extractNative(variantKey);
      if (!nativeId || !map[nativeId]) continue;
      const nativeEntry = map[nativeId];
      for (const field of ["safe", "major"]) {
        const variantTarget = entry[field];
        const nativeTarget = nativeEntry[field];
        if (nativeTarget === null && variantTarget !== null) {
          errors.push(
            `${rule.name}: "${variantKey}".${field} is "${variantTarget}" but native "${nativeId}".${field} is null`
          );
        }
        if (nativeTarget !== null && variantTarget === null) {
          errors.push(
            `${rule.name}: "${variantKey}".${field} is null but native "${nativeId}".${field} is "${nativeTarget}"`
          );
        }
      }
    }
  }
  return errors;
}
var OPENROUTER_RULE = {
  name: "OpenRouter",
  pattern: /^[a-z-]+\//,
  extractNative: (key) => {
    const slash = key.indexOf("/");
    return slash > 0 ? key.slice(slash + 1) : null;
  }
};
function validateUpgradeMap(map, rules = [OPENROUTER_RULE]) {
  const errors = checkVariantConsistency(map, rules);
  if (errors.length > 0) {
    return { ok: false, error: errors };
  }
  return { ok: true, data: void 0 };
}

// src/core/model-version.ts
var TIER_TOKENS = /* @__PURE__ */ new Set([
  "mini",
  "nano",
  "micro",
  "flash",
  "lite",
  "turbo",
  "fast",
  "pro",
  "plus",
  "ultra",
  "max",
  "sonnet",
  "haiku",
  "opus",
  "instruct",
  "chat",
  "coder",
  "codex",
  "large",
  "medium",
  "small",
  "nemo"
]);
function tierOf(suffix) {
  return suffix.split("-").filter((t) => TIER_TOKENS.has(t)).sort().join("-");
}
var VERSION_PATTERN = /^(.+?)[-_]?v?(\d+(?:\.\d+)*)(.*)$/;
function parseModelVersion(id) {
  const match = VERSION_PATTERN.exec(id);
  if (!match) return null;
  const [, line = "", versionStr = "", suffix = ""] = match;
  const version = versionStr.split(".").map(Number);
  if (version.some(isNaN)) return null;
  return { line, version, suffix, tier: tierOf(suffix) };
}
function isHigherVersion(a, b) {
  const len = Math.max(a.length, b.length);
  for (let i = 0; i < len; i++) {
    const av = a[i] ?? 0;
    const bv = b[i] ?? 0;
    if (av > bv) return true;
    if (av < bv) return false;
  }
  return false;
}

// src/core/model-discovery.ts
var NON_CHAT_PATTERN = /embed|rerank|tts|whisper|dall-e|image|moderat|guard|diffusion|flux|veo|imagen|safety|jamba-1\.5/i;
var PROVIDER_CONFIGS = [
  {
    name: "OpenRouter",
    url: "https://openrouter.ai/api/v1/models",
    envVar: "OPENROUTER_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => extractDataIds(body)
  },
  {
    name: "OpenAI",
    url: "https://api.openai.com/v1/models",
    envVar: "OPENAI_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => extractDataIds(body)
  },
  {
    name: "Anthropic",
    url: "https://api.anthropic.com/v1/models",
    envVar: "ANTHROPIC_API_KEY",
    authStyle: "x-api-key",
    extractIds: (body) => extractDataIds(body)
  },
  {
    name: "Google",
    url: "https://generativelanguage.googleapis.com/v1beta/models",
    envVar: "GOOGLE_API_KEY",
    authStyle: "query-param",
    extractIds: (body) => {
      const b = body;
      return (b.models ?? []).map((m) => (m.name ?? "").replace(/^models\//, "")).filter(Boolean);
    }
  },
  {
    name: "DeepSeek",
    url: "https://api.deepseek.com/models",
    envVar: "DEEPSEEK_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => extractDataIds(body)
  },
  {
    name: "xAI",
    url: "https://api.x.ai/v1/models",
    envVar: "XAI_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => extractDataIds(body)
  },
  {
    name: "Together",
    url: "https://api.together.xyz/v1/models",
    envVar: "TOGETHER_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => {
      if (Array.isArray(body)) {
        return body.map((m) => m.id ?? "").filter(Boolean);
      }
      return extractDataIds(body);
    }
  },
  {
    name: "Groq",
    url: "https://api.groq.com/openai/v1/models",
    envVar: "GROQ_API_KEY",
    authStyle: "bearer",
    extractIds: (body) => extractDataIds(body)
  }
];
function extractDataIds(body) {
  const b = body;
  return (b.data ?? []).map((m) => m.id ?? "").filter(Boolean);
}
function sanitizeError(msg, key) {
  if (!key) return msg;
  return msg.replaceAll(key, "***").replaceAll(key.trim(), "***");
}
async function fetchProviderModels(config) {
  const key = process.env[config.envVar]?.trim();
  if (!key && config.name !== "OpenRouter") {
    return { ok: false, error: `Missing ${config.envVar}` };
  }
  const headers = {};
  let url = config.url;
  if (key) {
    if (config.authStyle === "bearer") {
      headers["Authorization"] = `Bearer ${key}`;
    } else if (config.authStyle === "x-api-key") {
      headers["x-api-key"] = key;
      headers["anthropic-version"] = "2023-06-01";
    } else if (config.authStyle === "query-param") {
      url = `${url}?key=${key}`;
    }
  }
  let response;
  try {
    response = await fetch(url, { headers, signal: AbortSignal.timeout(3e4) });
  } catch (err) {
    const raw = err instanceof Error ? err.message : "fetch failed";
    return { ok: false, error: `${config.name}: ${sanitizeError(raw, key)}` };
  }
  if (!response.ok) {
    return {
      ok: false,
      error: `${config.name}: HTTP ${String(response.status)}`
    };
  }
  let body;
  try {
    body = await response.json();
  } catch {
    return { ok: false, error: `${config.name}: invalid JSON response` };
  }
  return { ok: true, data: config.extractIds(body) };
}
async function fetchAllProviderModels(configs = PROVIDER_CONFIGS) {
  const models = {};
  const skipped = [];
  const results = await Promise.all(
    configs.map(async (c) => ({ config: c, result: await fetchProviderModels(c) }))
  );
  for (const { config, result } of results) {
    if (result.ok) {
      models[config.name] = new Set(result.data);
    } else {
      skipped.push(`${config.name}: ${result.error}`);
    }
  }
  return { models, skipped };
}
function filterChatModels(ids) {
  return ids.filter((id) => !NON_CHAT_PATTERN.test(id));
}
function diffModels(knownKeys, discovered) {
  return discovered.filter((id) => !knownKeys.has(id));
}
var DATE_PATTERN = /^(.+?)[-_](\d{4})[-_]?(\d{2})[-_]?(\d{2})(.*)$/;
function parseModelFamily(id) {
  const match = DATE_PATTERN.exec(id);
  if (!match) return null;
  const [, family = "", y = "", m = "", d = "", suffix = ""] = match;
  return { family, date: `${y}${m}${d}`, suffix };
}
function detectSafeUpgrades(newIds, map, sourceMap) {
  const proposed = [];
  for (const newId of newIds) {
    const parsed = parseModelFamily(newId);
    if (!parsed) continue;
    for (const [existingKey, existingEntry] of Object.entries(map)) {
      if (existingEntry.safe !== null) continue;
      const existingParsed = parseModelFamily(existingKey);
      if (!existingParsed) continue;
      if (existingParsed.family !== parsed.family) continue;
      if (existingParsed.suffix !== parsed.suffix) continue;
      if (existingParsed.date >= parsed.date) continue;
      proposed.push({
        key: existingKey,
        entry: { safe: newId, major: existingEntry.major },
        confidence: "auto",
        reason: `Same family "${parsed.family}", newer date ${parsed.date} > ${existingParsed.date}`,
        sources: sourceMap?.get(newId) ?? []
      });
    }
  }
  return proposed;
}
function suggestMajorUpgrades(newIds, map, sourceMap) {
  const proposed = [];
  for (const newId of newIds) {
    if (DATE_PATTERN.test(newId)) continue;
    const parsed = parseModelVersion(newId);
    if (!parsed) continue;
    for (const [existingKey, existingEntry] of Object.entries(map)) {
      if (existingEntry.major !== null) {
        const currentMajorParsed = parseModelVersion(existingEntry.major);
        if (!currentMajorParsed) continue;
        if (currentMajorParsed.line !== parsed.line) continue;
        if (!isHigherVersion(parsed.version, currentMajorParsed.version)) continue;
        if (currentMajorParsed.tier !== parsed.tier) continue;
      }
      const existingParsed = parseModelVersion(existingKey);
      if (!existingParsed) continue;
      if (existingParsed.line !== parsed.line) continue;
      if (existingParsed.tier !== parsed.tier) continue;
      if (!isHigherVersion(parsed.version, existingParsed.version)) continue;
      if (existingParsed.version.length === 1 && (existingParsed.version[0] ?? 0) > 1e3) continue;
      if (existingEntry.safe === newId) continue;
      proposed.push({
        key: existingKey,
        entry: { safe: existingEntry.safe, major: newId },
        confidence: "suggested",
        reason: `Same line "${parsed.line}", higher version ${parsed.version.join(".")} > ${existingParsed.version.join(".")}`,
        sources: sourceMap?.get(newId) ?? []
      });
    }
  }
  return proposed;
}
function generateReport(proposed, skipped) {
  const lines = ["## Model Discovery Report\n"];
  if (proposed.length === 0) {
    lines.push("No new upgrade paths discovered.\n");
  } else {
    lines.push(`Found ${String(proposed.length)} proposed upgrade path(s):
`);
    lines.push("| Model | Safe | Major | Confidence | Source | Reason |");
    lines.push("|-------|------|-------|------------|--------|--------|");
    for (const p of proposed) {
      const src = p.sources.length > 0 ? p.sources.join(", ") : "-";
      lines.push(
        `| \`${p.key}\` | ${p.entry.safe ?? "-"} | ${p.entry.major ?? "-"} | ${p.confidence} | ${src} | ${p.reason} |`
      );
    }
    lines.push("");
  }
  if (skipped.length > 0) {
    lines.push("### Skipped Providers\n");
    for (const s of skipped) {
      lines.push(`- ${s}`);
    }
    lines.push("");
  }
  return lines.join("\n");
}
export {
  OPENROUTER_RULE,
  PROVIDER_CONFIGS,
  SUPPORTED_EXTENSIONS,
  applyFixes,
  buildPrefixRegex,
  checkVariantConsistency,
  computeEdits,
  detectSafeUpgrades,
  diffModels,
  fetchAllProviderModels,
  fetchProviderModels,
  fileMatchesPrefixFilter,
  filterChatModels,
  generateReport,
  loadUpgradeMap,
  lookupModel,
  scanDirectory,
  scanFile,
  suggestMajorUpgrades,
  validateUpgradeMap
};
//# sourceMappingURL=index.js.map