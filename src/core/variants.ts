/**
 * Pure functions for normalizing model ID variants.
 * Used by discovery to strip provider prefixes before diffing.
 */

/** Matches OpenRouter-style provider prefixes: "openai/", "meta-llama/", etc. */
const PROVIDER_PREFIX = /^[a-z][a-z0-9-]*\//i

/** Strip a provider prefix from a model ID. Returns the bare ID. */
export function stripPrefix(id: string): string {
  return id.replace(PROVIDER_PREFIX, '')
}

// ── Pre-filtering ───────────────────────────────────────────
// Only strip models that are structurally impossible to classify:
// fine-tunes (user-specific), colon-tagged (OpenRouter variant
// tags stripped at scan time), and org-scoped (private).
// Everything else goes to the AI — it's better at judging
// relevance than a brittle regex list.

const STRUCTURAL_NOISE = [
  /^ft[:-]/i, // fine-tune prefixes
  /[:@]/, // colon-tagged or scoped IDs
  /^accounts\//i, // org-scoped fine-tunes
]

export function prefilter(ids: string[]): string[] {
  return ids.filter((id) => !STRUCTURAL_NOISE.some((p) => p.test(id)))
}
