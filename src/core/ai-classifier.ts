import type { FamiliesMap } from './families.js'

export interface ModelMetadata {
  id: string
  name?: string
  modality?: string
  contextLength?: number
}

export interface ClassificationResult {
  families: FamiliesMap
  unclassified: string[]
}

/**
 * Use an AI model to classify new models into the correct families.
 * Requires ANTHROPIC_API_KEY in the environment.
 *
 * @param currentFamilies - The current families.json data
 * @param newModelIds - List of newly discovered model IDs to classify
 * @param metadata - Optional metadata about the new models (from OpenRouter)
 * @returns Updated families map with new models placed in correct lineages
 */
export async function classifyNewModels(
  currentFamilies: FamiliesMap,
  newModelIds: string[],
  _metadata?: Map<string, ModelMetadata>,
): Promise<ClassificationResult> {
  if (newModelIds.length === 0) {
    return { families: currentFamilies, unclassified: [] }
  }

  // TODO: Implement AI classification using Anthropic API with tool use
  // For now, return all models as unclassified so discovery can report them
  // without modifying families.json automatically.
  //
  // When implemented, this will:
  // 1. Build a prompt with current families + new model IDs + metadata
  // 2. Call the Anthropic API with WebSearch/WebFetch tools
  // 3. Parse structured output to get updated families
  // 4. Validate the result (no cross-tier, no duplicates, etc.)
  //
  // The prompt should include edge cases documented in the plan:
  // - Colon-tagged models (:free, :exacto) → skip
  // - Date-stamped models → same inner array as alias
  // - Cross-tier prevention (mini != flagship)
  // - Separator normalization (dots canonical)

  return { families: currentFamilies, unclassified: [...newModelIds] }
}
