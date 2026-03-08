#!/usr/bin/env node

// src/cli/index.ts
import { Command } from "commander";
import { resolve } from "path";
import { performance } from "perf_hooks";

// src/core/upgrade-map.ts
import { readFile } from "fs/promises";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
function resolveDefaultPath() {
  const dir = typeof __dirname !== "undefined" ? __dirname : dirname(fileURLToPath(import.meta.url));
  return [
    join(dir, "..", "..", "data", "upgrades.json"),
    join(dir, "..", "data", "upgrades.json")
  ];
}
var DEFAULT_FALLBACK_PATHS = resolveDefaultPath();
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
  return { ok: true, data: parsed };
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
  const fallbackPaths = options?.fallbackPath ? [options.fallbackPath] : DEFAULT_FALLBACK_PATHS;
  const url = options?.url;
  if (url) {
    const urlResult = await loadFromUrl(url);
    if (urlResult.ok) return urlResult;
    return loadFromPaths(fallbackPaths);
  }
  return loadFromPaths(fallbackPaths);
}

// src/core/directory-scanner.ts
import { readFile as readFile2, readdir, stat } from "fs/promises";
import { join as join2, extname, relative } from "path";
import { execSync } from "child_process";

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
var SUPPORTED_EXTENSIONS = Object.freeze([
  // Web / scripting
  ".py",
  ".ts",
  ".js",
  ".tsx",
  ".jsx",
  ".rb",
  ".php",
  ".lua",
  // Systems / compiled
  ".go",
  ".java",
  ".rs",
  ".cs",
  ".cpp",
  ".cc",
  ".c",
  ".h",
  // Mobile / JVM
  ".kt",
  ".kts",
  ".swift",
  ".dart",
  ".scala",
  // Shell
  ".sh",
  ".bash",
  ".zsh",
  // Elixir / R
  ".ex",
  ".exs",
  ".r",
  ".R",
  // Frontend frameworks
  ".vue",
  ".svelte",
  // Docs / content
  ".md",
  ".mdx",
  // Config / data
  ".yaml",
  ".yml",
  ".json",
  ".toml",
  ".env",
  ".cfg",
  ".ini",
  // Infrastructure
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
async function listSupportedFiles(dir, extra = []) {
  const allFiles = tryGitLsFiles(dir) ?? await walkDirectory(dir, dir);
  return allFiles.filter((f) => hasSupportedExtension(f, extra));
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
  const supportedFiles = await listSupportedFiles(dir, extra);
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

// src/cli/reporter.ts
import pc from "picocolors";
function formatMatch(match) {
  const location = pc.cyan(`${match.file}:${String(match.line)}`);
  const model = pc.yellow(`"${match.matchedText}"`);
  const lines = [`${location}  ${model}`];
  if (match.safeUpgrade) {
    lines.push(`  ${pc.green("\u2192")} safe:  ${pc.green(match.safeUpgrade)}`);
  }
  if (match.majorUpgrade) {
    lines.push(
      `  ${pc.magenta("\u2192")} major: ${pc.magenta(match.majorUpgrade)}`
    );
  }
  return lines.join("\n");
}
function formatScanReport(report, durationMs) {
  const lines = [];
  for (const match of report.matches) {
    lines.push(formatMatch(match));
    lines.push("");
  }
  const count = report.matches.length;
  const modelWord = count === 1 ? "model" : "models";
  const fileCount = new Set(report.matches.map((m) => m.file)).size;
  const fileWord = fileCount === 1 ? "file" : "files";
  const summary = `Found ${String(count)} upgradable ${modelWord} in ${String(fileCount)} ${fileWord} (scanned ${String(report.scannedFiles)}/${String(report.totalFiles)} files in ${String(durationMs)}ms)`;
  lines.push(pc.bold(summary));
  return lines.join("\n") + "\n";
}
function formatPrBody(report) {
  const lines = ["## LLM Model Upgrades", ""];
  lines.push("| File | Line | Model | Upgrade | Tier |");
  lines.push("|------|------|-------|---------|------|");
  for (const m of report.matches) {
    const upgrade = m.safeUpgrade ?? m.majorUpgrade ?? "\u2014";
    const tier = m.safeUpgrade ? "safe" : m.majorUpgrade ? "major" : "\u2014";
    lines.push(
      `| \`${m.file}\` | ${String(m.line)} | \`${m.matchedText}\` | \`${upgrade}\` | ${tier} |`
    );
  }
  lines.push("");
  const count = report.matches.length;
  const upgradeWord = count === 1 ? "upgrade" : "upgrades";
  const fileCount = new Set(report.matches.map((m) => m.file)).size;
  const fileWord = fileCount === 1 ? "file" : "files";
  lines.push(`**${String(count)} ${upgradeWord} across ${String(fileCount)} ${fileWord}**`);
  return lines.join("\n") + "\n";
}
function buildFixEdits(matches) {
  const edits = [];
  for (const m of matches) {
    const newText = m.safeUpgrade ?? m.majorUpgrade;
    if (!newText) continue;
    const tier = m.safeUpgrade ? "safe" : "major";
    edits.push({
      file: m.file,
      line: m.line,
      oldText: m.matchedText,
      newText,
      tier
    });
  }
  return edits;
}
function formatFixReport(result, edits) {
  const modelWord = result.applied === 1 ? "model" : "models";
  const lines = [];
  lines.push(pc.bold(`Fixed ${String(result.applied)} ${modelWord}:`));
  for (const edit of edits) {
    const location = pc.cyan(`${edit.file}:${String(edit.line)}`);
    const old = pc.red(`"${edit.oldText}"`);
    const arrow = "\u2192";
    const replacement = pc.green(`"${edit.newText}"`);
    const tier = pc.dim(`(${edit.tier})`);
    lines.push(`  ${location}  ${old} ${arrow} ${replacement} ${tier}`);
  }
  return lines.join("\n") + "\n";
}

// src/cli/index.ts
var program = new Command();
program.name("llm-upgrade-bot").description(
  "Scan codebases for outdated LLM model strings and propose upgrades"
).version("0.1.0");
program.argument("[directory]", "directory to scan", ".").option("--fix", "auto-apply upgrades to files").option("--json", "output results as JSON").option("--pr-body", "output markdown PR body for upgrade matches").option("--extensions <exts>", 'extra file extensions to scan (comma-separated, e.g. ".txt,.cfg")').action(async (directory, options) => {
  const dir = resolve(directory);
  await runScan(dir, options);
});
function parseExtensions(raw) {
  if (!raw) return [];
  return raw.split(",").map((e) => e.trim()).map(
    (e) => e.startsWith(".") ? e : `.${e}`
  );
}
async function runScan(dir, options) {
  const mapResult = await loadUpgradeMap();
  if (!mapResult.ok) {
    process.stderr.write(`Error: ${mapResult.error}
`);
    process.exit(2);
    return;
  }
  const upgradeMap = mapResult.data;
  const extraExtensions = parseExtensions(options.extensions);
  const start = performance.now();
  const report = await scanDirectory(dir, upgradeMap, { extraExtensions });
  const durationMs = Math.round(performance.now() - start);
  if (options.json) {
    process.stdout.write(JSON.stringify(report, null, 2) + "\n");
    process.exit(report.matches.length > 0 ? 1 : 0);
    return;
  }
  if (options.prBody) {
    process.stdout.write(formatPrBody(report));
    process.exit(report.matches.length > 0 ? 1 : 0);
    return;
  }
  if (options.fix) {
    const fixEdits = buildFixEdits(report.matches);
    const edits = computeEdits(report.matches);
    const result = await applyFixes(
      edits.map((e) => ({ ...e, file: resolve(dir, e.file) }))
    );
    process.stdout.write(formatFixReport(result, fixEdits));
    process.exit(0);
    return;
  }
  process.stdout.write(formatScanReport(report, durationMs));
  process.exit(report.matches.length > 0 ? 1 : 0);
}
var isDirectRun = process.argv[1] !== void 0 && /cli(?:\/index)?(?:\.ts|\.js)$/.test(process.argv[1]);
if (isDirectRun) {
  program.parseAsync();
}
export {
  program
};
//# sourceMappingURL=cli.js.map