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
