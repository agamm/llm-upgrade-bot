"use strict";
var __defProp = Object.defineProperty;
var __getOwnPropDesc = Object.getOwnPropertyDescriptor;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __hasOwnProp = Object.prototype.hasOwnProperty;
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};
var __copyProps = (to, from, except, desc) => {
  if (from && typeof from === "object" || typeof from === "function") {
    for (let key of __getOwnPropNames(from))
      if (!__hasOwnProp.call(to, key) && key !== except)
        __defProp(to, key, { get: () => from[key], enumerable: !(desc = __getOwnPropDesc(from, key)) || desc.enumerable });
  }
  return to;
};
var __toCommonJS = (mod) => __copyProps(__defProp({}, "__esModule", { value: true }), mod);

// src/core/index.ts
var core_exports = {};
__export(core_exports, {
  OPENROUTER_RULE: () => OPENROUTER_RULE,
  PREFIX_RULES: () => PREFIX_RULES,
  PROVIDER_CONFIGS: () => PROVIDER_CONFIGS,
  SUPPORTED_EXTENSIONS: () => SUPPORTED_EXTENSIONS,
  allModelsInFamilies: () => allModelsInFamilies,
  applyFixes: () => applyFixes,
  buildPrefixRegex: () => buildPrefixRegex,
  checkVariantConsistency: () => checkVariantConsistency,
  computeEdits: () => computeEdits,
  deriveUpgradeMap: () => deriveUpgradeMap,
  diffModels: () => diffModels,
  fetchAllProviderModels: () => fetchAllProviderModels,
  fetchProviderModels: () => fetchProviderModels,
  fileMatchesPrefixFilter: () => fileMatchesPrefixFilter,
  filterChatModels: () => filterChatModels,
  findModelInFamilies: () => findModelInFamilies,
  loadFamilies: () => loadFamilies,
  loadUpgradeMap: () => loadUpgradeMap,
  lookupModel: () => lookupModel,
  scanDirectory: () => scanDirectory,
  scanFile: () => scanFile,
  validateUpgradeMap: () => validateUpgradeMap
});
module.exports = __toCommonJS(core_exports);

// src/core/upgrade-map.ts
var import_promises = require("fs/promises");
var import_node_path = require("path");
var import_node_url = require("url");
var import_meta = {};
function resolveDefaultPaths() {
  const dir = typeof __dirname !== "undefined" ? __dirname : (0, import_node_path.dirname)((0, import_node_url.fileURLToPath)(import_meta.url));
  return [
    (0, import_node_path.join)(dir, "..", "..", "data", "upgrades.json"),
    (0, import_node_path.join)(dir, "..", "data", "upgrades.json")
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
    text = await (0, import_promises.readFile)(path, "utf-8");
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
function stripColonTag(id) {
  const colonIdx = id.lastIndexOf(":");
  if (colonIdx <= 0) return null;
  const tag = id.slice(colonIdx);
  if (/^:\d+$/.test(tag)) return null;
  return { base: id.slice(0, colonIdx), tag };
}
function matchToResult(match, filePath, lineOffsets, upgradeMap) {
  const modelId = match[1] ?? match[2];
  if (!modelId) return void 0;
  let entry = upgradeMap[modelId];
  let colonTag = "";
  if (!entry) {
    const stripped = stripColonTag(modelId);
    if (stripped) {
      entry = upgradeMap[stripped.base];
      if (entry) colonTag = stripped.tag;
    }
  }
  if (!entry) return void 0;
  const { line, column } = resolvePosition(lineOffsets, match.index);
  return {
    file: filePath,
    line,
    column,
    matchedText: modelId,
    safeUpgrade: entry.safe ? entry.safe + colonTag : null,
    majorUpgrade: entry.major ? entry.major + colonTag : null
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
var import_promises2 = require("fs/promises");
var import_node_path2 = require("path");
var import_node_child_process = require("child_process");
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
  const ext = (0, import_node_path2.extname)(filePath);
  return SUPPORTED_EXTENSIONS.includes(ext) || extra.includes(ext);
}
function tryGitLsFiles(dir) {
  try {
    const output = (0, import_node_child_process.execSync)("git ls-files", {
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
    names = await (0, import_promises2.readdir)(dir);
  } catch {
    return [];
  }
  const files = [];
  for (const name of names) {
    const fullPath = (0, import_node_path2.join)(dir, name);
    const fileStat = await (0, import_promises2.stat)(fullPath).catch(() => null);
    if (!fileStat) continue;
    if (fileStat.isDirectory() && !IGNORED_DIRS.has(name)) {
      files.push(...await walkDirectory(fullPath, root));
    } else if (fileStat.isFile()) {
      files.push((0, import_node_path2.relative)(root, fullPath));
    }
  }
  return files;
}
async function directoryExists(dir) {
  try {
    const s = await (0, import_promises2.stat)(dir);
    return s.isDirectory();
  } catch {
    return false;
  }
}
function matchGlob(filePath, pattern) {
  const regex = new RegExp(
    "^" + pattern.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*\*/g, "{{GLOBSTAR}}").replace(/\*/g, "[^/]*").replace(/{{GLOBSTAR}}/g, ".*") + "$"
  );
  return regex.test(filePath) || regex.test((0, import_node_path2.basename)(filePath));
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
    const content = await readFileSafe((0, import_node_path2.join)(dir, filePath));
    if (content === null) continue;
    if (!fileMatchesPrefixFilter(content, prefixRegex)) continue;
    scannedFiles++;
    matches.push(...scanFile(filePath, content, upgradeMap));
  }
  return { scannedFiles, matches };
}
async function readFileSafe(path) {
  try {
    return await (0, import_promises2.readFile)(path, "utf-8");
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
var import_promises3 = require("fs/promises");
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
    const content = await (0, import_promises3.readFile)(filePath, "utf-8");
    const { result: updated, appliedCount } = applyEditsToContent(content, fileEdits);
    await (0, import_promises3.writeFile)(filePath, updated, "utf-8");
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

// src/core/model-discovery.ts
var NON_CHAT_PATTERN = /embed|rerank|tts|whisper|dall-e|image|moderat|guard|diffusion|flux|veo|imagen|safety|jamba-1\.5|transcribe/i;
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

// src/core/families.ts
var import_node_fs = require("fs");
var import_node_path3 = require("path");
var import_meta2 = {};
function loadFamilies(customPath) {
  const filePath = customPath ?? (0, import_node_path3.join)(import_meta2.dirname, "../../data/families.json");
  try {
    const raw = (0, import_node_fs.readFileSync)(filePath, "utf-8");
    const parsed = JSON.parse(raw);
    return { ok: true, data: parsed };
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return { ok: false, error: `Failed to load families.json: ${message}` };
  }
}
function allModelsInFamilies(families) {
  const models = /* @__PURE__ */ new Set();
  for (const chain of Object.values(families)) {
    for (const generation of chain) {
      for (const modelId of generation) {
        models.add(modelId);
      }
    }
  }
  return models;
}
function findModelInFamilies(families, modelId) {
  for (const [lineageKey, chain] of Object.entries(families)) {
    for (let genIndex = 0; genIndex < chain.length; genIndex++) {
      const generation = chain[genIndex] ?? [];
      for (let posIndex = 0; posIndex < generation.length; posIndex++) {
        if (generation[posIndex] === modelId) {
          return { lineageKey, genIndex, posIndex };
        }
      }
    }
  }
  return null;
}

// src/core/derive-upgrades.ts
var PREFIX_RULES = [
  { pattern: /^openai-/, prefixes: ["openai/"] },
  { pattern: /^anthropic-/, prefixes: ["anthropic/"] },
  { pattern: /^google-|^gemini-/, prefixes: ["google/", "gemini/"] },
  { pattern: /^mistral-/, prefixes: ["mistralai/"] },
  { pattern: /^deepseek/, prefixes: ["deepseek/"] },
  { pattern: /^xai-/, prefixes: ["x-ai/"] },
  { pattern: /^kimi/, prefixes: ["moonshotai/"] },
  { pattern: /^qwen/, prefixes: ["qwen/"] },
  { pattern: /^llama-|^meta-llama/, prefixes: ["meta-llama/"] }
];
function isVersionSequence(seq, sep) {
  return seq.split(sep).every((p) => p.length <= 2);
}
function toHyphenVariant(id) {
  const replaced = id.replace(
    /\d+(?:\.(?!\d+[bBkK])\d+)+/g,
    (m) => isVersionSequence(m, ".") ? m.replaceAll(".", "-") : m
  );
  return replaced !== id ? replaced : null;
}
function convertTargetSeparators(target, useHyphens) {
  if (useHyphens) {
    return target.replace(
      /\d+(?:\.(?!\d+[bBkK])\d+)+/g,
      (m) => isVersionSequence(m, ".") ? m.replaceAll(".", "-") : m
    );
  }
  return target;
}
function convertEntrySeparators(entry) {
  return {
    safe: entry.safe ? convertTargetSeparators(entry.safe, true) : null,
    major: entry.major ? convertTargetSeparators(entry.major, true) : null
  };
}
function computeEntry(chain, genIndex, posIndex) {
  const generation = chain[genIndex] ?? [];
  const lastGen = chain[chain.length - 1] ?? [];
  const ultimate = lastGen[lastGen.length - 1] ?? "";
  const lastInGen = generation[generation.length - 1] ?? "";
  const isLastInGen = posIndex === generation.length - 1;
  const isLastGen = genIndex === chain.length - 1;
  const safe = isLastInGen ? null : lastInGen;
  const major = isLastGen && isLastInGen ? null : ultimate;
  return { safe, major: major === safe ? null : major };
}
function addSeparatorVariants(map) {
  const baseKeys = Object.keys(map);
  for (const key of baseKeys) {
    const hyphenKey = toHyphenVariant(key);
    if (hyphenKey && !(hyphenKey in map)) {
      const entry = map[key];
      if (entry) map[hyphenKey] = convertEntrySeparators(entry);
    }
  }
}
function matchingPrefixes(lineageKey) {
  for (const rule of PREFIX_RULES) {
    if (rule.pattern.test(lineageKey)) return rule.prefixes;
  }
  return [];
}
function addPrefixVariants(map, families) {
  for (const [lineageKey, chain] of Object.entries(families)) {
    const prefixes = matchingPrefixes(lineageKey);
    if (prefixes.length === 0) continue;
    for (const generation of chain) {
      for (const modelId of generation) {
        const entry = map[modelId];
        if (!entry) continue;
        for (const prefix of prefixes) {
          const prefixedKey = prefix + modelId;
          if (prefixedKey in map) continue;
          map[prefixedKey] = {
            safe: entry.safe ? prefix + entry.safe : null,
            major: entry.major ? prefix + entry.major : null
          };
        }
      }
    }
  }
}
function deriveUpgradeMap(families) {
  const map = {};
  for (const chain of Object.values(families)) {
    for (let gi = 0; gi < chain.length; gi++) {
      const gen = chain[gi] ?? [];
      for (let pi = 0; pi < gen.length; pi++) {
        const modelId = gen[pi];
        if (modelId) map[modelId] = computeEntry(chain, gi, pi);
      }
    }
  }
  addSeparatorVariants(map);
  addPrefixVariants(map, families);
  addSeparatorVariants(map);
  return map;
}
// Annotate the CommonJS export names for ESM import in node:
0 && (module.exports = {
  OPENROUTER_RULE,
  PREFIX_RULES,
  PROVIDER_CONFIGS,
  SUPPORTED_EXTENSIONS,
  allModelsInFamilies,
  applyFixes,
  buildPrefixRegex,
  checkVariantConsistency,
  computeEdits,
  deriveUpgradeMap,
  diffModels,
  fetchAllProviderModels,
  fetchProviderModels,
  fileMatchesPrefixFilter,
  filterChatModels,
  findModelInFamilies,
  loadFamilies,
  loadUpgradeMap,
  lookupModel,
  scanDirectory,
  scanFile,
  validateUpgradeMap
});
//# sourceMappingURL=index.cjs.map