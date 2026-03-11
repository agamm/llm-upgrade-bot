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
          familyKey: { type: 'string' as const },
          genIndex: { type: 'number' as const },
          position: { type: 'string' as const, enum: ['append', 'new_generation'] },
        },
        required: ['modelId', 'familyKey', 'genIndex', 'position'],
      },
    },
    newFamilies: {
      type: 'array' as const,
      items: {
        type: 'object' as const,
        properties: {
          familyKey: { type: 'string' as const },
          generations: {
            type: 'array' as const,
            items: { type: 'array' as const, items: { type: 'string' as const } },
          },
        },
        required: ['familyKey', 'generations'],
      },
    },
    unclassified: { type: 'array' as const, items: { type: 'string' as const } },
  },
  required: ['placements', 'newFamilies', 'unclassified'],
}

export interface Placement {
  modelId: string
  familyKey: string
  genIndex: number
  position: 'append' | 'new_generation'
}

export interface AgentOutput {
  placements: Placement[]
  newFamilies: { familyKey: string; generations: string[][] }[]
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
- Each key (e.g. "openai-flagship") is a model family
- Outer array = major generations (upgrading across is a "major" upgrade)
- Inner array = safe upgrades within one generation (interchangeable)
- Un-timestamped aliases go LAST in their inner array
- Version separators use DOTS canonically: "gpt-4.1" not "gpt-4-1"
- Date-stamped snapshots (e.g. "gpt-5-2025-08-07") share an inner array with their alias
- Never mix tiers: mini/nano/flagship must be in separate families
- Provider-prefixed IDs (openai/X) are handled by derivation — don't add them here

## Models to classify
${ids.map((id) => `- \`${id}\``).join('\n')}

## Instructions
Use WebSearch and WebFetch to research models you're unsure about.
Check provider docs, release announcements, changelogs.

Each model goes in exactly ONE of these:
1. **placements** — model belongs in an existing family
   - "append": add to the inner array at genIndex
   - "new_generation": insert a new inner array AFTER genIndex (-1 to prepend)
2. **newFamilies** — model starts a brand-new family (provide familyKey + full generations array)
   - Do NOT also put the model in placements — newFamilies is self-contained
3. **unclassified** — unclear or irrelevant

Prefer unclassified over a wrong guess.`
}

// ── Apply output to families ────────────────────────────────

export function applyOutput(families: FamiliesMap, output: AgentOutput): FamiliesMap {
  const result = structuredClone(families)

  for (const { modelId, familyKey, genIndex, position } of output.placements) {
    const chain = result[familyKey]
    if (!chain) continue
    if (position === 'append') {
      chain[genIndex]?.push(modelId)
    } else {
      chain.splice(genIndex + 1, 0, [modelId])
    }
  }

  for (const { familyKey, generations } of output.newFamilies) {
    result[familyKey] ??= generations
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
