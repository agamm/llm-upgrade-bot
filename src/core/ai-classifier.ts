import { query } from '@anthropic-ai/claude-agent-sdk'
import type { FamiliesMap } from './families.js'

export interface ClassificationResult {
  families: FamiliesMap
  unclassified: string[]
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

// ── Structured output schema ────────────────────────────────

const OUTPUT_SCHEMA = {
  type: 'object' as const,
  properties: {
    placements: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          modelId: { type: 'string' as const },
          lineageKey: { type: 'string' as const },
          genIndex: { type: 'number' as const },
          position: { type: 'string' as const, enum: ['append', 'new_generation'] },
        },
        required: ['modelId', 'lineageKey', 'genIndex', 'position'],
      },
    },
    newLineages: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          lineageKey: { type: 'string' as const },
          generations: {
            type: 'array' as const,
            items: { type: 'array' as const, items: { type: 'string' as const } },
          },
        },
        required: ['lineageKey', 'generations'],
      },
    },
    unclassified: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['placements', 'newLineages', 'unclassified'],
}

export interface Placement {
  modelId: string
  lineageKey: string
  genIndex: number
  position: 'append' | 'new_generation'
}

export interface AgentOutput {
  placements: Placement[]
  newLineages: { lineageKey: string; generations: string[][] }[]
  unclassified: string[]
}

// ── Prompt ──────────────────────────────────────────────────

function buildPrompt(families: FamiliesMap, ids: string[]): string {
  return `You are classifying newly discovered LLM model IDs into families.json.

## families.json (current)
\`\`\`json
${JSON.stringify(families, null, 2)}
\`\`\`

## How families.json works
- Each key (e.g. "openai-flagship") is a lineage of related models
- Outer array = major generations (upgrading across is a "major" upgrade)
- Inner array = safe upgrades within one generation (interchangeable)
- Un-timestamped aliases go LAST in their inner array
- Version separators use DOTS canonically: "gpt-4.1" not "gpt-4-1"
- Date-stamped snapshots (e.g. "gpt-5-2025-08-07") share an inner array with their alias
- Never mix tiers: mini/nano/flagship must be in separate lineages
- Provider-prefixed IDs (openai/X) are handled by derivation — don't add them here

## Models to classify
${ids.map((id) => `- \`${id}\``).join('\n')}

## Instructions
Use WebSearch and WebFetch to research models you're unsure about.
Check provider docs, release announcements, changelogs.

For each model decide:
1. It belongs in an existing lineage → placement (append to a generation, or start a new one)
2. It starts a genuinely new model family → newLineage
3. It's unclear or irrelevant → unclassified

For placements:
- "append" adds the model to the inner array at genIndex
- "new_generation" inserts a new inner array AFTER genIndex (-1 to prepend)

Prefer unclassified over a wrong guess.`
}

// ── Apply output to families ────────────────────────────────

export function applyOutput(families: FamiliesMap, output: AgentOutput): FamiliesMap {
  const result = structuredClone(families)

  for (const { modelId, lineageKey, genIndex, position } of output.placements) {
    const chain = result[lineageKey]
    if (!chain) continue
    if (position === 'append') {
      chain[genIndex]?.push(modelId)
    } else {
      chain.splice(genIndex + 1, 0, [modelId])
    }
  }

  for (const { lineageKey, generations } of output.newLineages) {
    result[lineageKey] ??= generations
  }

  return result
}

// ── Public API ──────────────────────────────────────────────

export async function classifyNewModels(
  currentFamilies: FamiliesMap,
  newModelIds: string[],
): Promise<ClassificationResult> {
  if (newModelIds.length === 0) {
    return { families: currentFamilies, unclassified: [] }
  }

  if (!process.env['ANTHROPIC_API_KEY']) {
    console.warn('ANTHROPIC_API_KEY not set — skipping AI classification')
    return { families: currentFamilies, unclassified: [...newModelIds] }
  }

  const fallback: ClassificationResult = {
    families: currentFamilies,
    unclassified: [...newModelIds],
  }

  let output: AgentOutput | undefined

  try {
    for await (const msg of query({
      prompt: buildPrompt(currentFamilies, newModelIds),
      options: {
        model: 'claude-sonnet-4-6',
        tools: ['WebSearch', 'WebFetch'],
        allowedTools: ['WebSearch', 'WebFetch'],
        maxTurns: 20,
        systemPrompt:
          'You classify LLM model IDs into a families.json structure. ' +
          'Use WebSearch/WebFetch to research unfamiliar models.',
        outputFormat: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
    })) {
      if ('result' in msg && 'structured_output' in msg && msg.structured_output) {
        output = msg.structured_output as AgentOutput
      }
    }
  } catch (err) {
    console.warn(`AI classification failed: ${err instanceof Error ? err.message : err}`)
    return fallback
  }

  if (!output) {
    console.warn('AI classification returned no structured output')
    return fallback
  }

  return {
    families: applyOutput(currentFamilies, output),
    unclassified: output.unclassified ?? [],
  }
}
