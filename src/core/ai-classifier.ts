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
If you recognize a model (e.g. a known provider's naming pattern, a dated snapshot
of an existing model), classify it directly — no need to search.
Only use WebSearch/WebFetch for models you genuinely don't recognize or don't
know where to place.

Skip models that are obviously NOT chat/reasoning LLMs (embeddings, TTS, image
generation, moderation, etc.) — put them in unclassified.

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

  console.log(`[classify] Starting agent for ${String(newModelIds.length)} models:`)
  for (const id of newModelIds) console.log(`  - ${id}`)
  let output: AgentOutput | undefined
  let turns = 0

  try {
    for await (const msg of query({
      prompt: buildPrompt(currentFamilies, newModelIds),
      options: {
        model: 'claude-sonnet-4-6',
        tools: ['WebSearch', 'WebFetch'],
        allowedTools: ['WebSearch', 'WebFetch'],
        maxTurns: 20,
        systemPrompt:
          'You classify LLM model IDs into model families in families.json. ' +
          'Use WebSearch/WebFetch to research unfamiliar models.',
        outputFormat: { type: 'json_schema', schema: OUTPUT_SCHEMA },
      },
    })) {
      if (msg.type === 'assistant') {
        turns++
        const blocks = 'content' in msg && Array.isArray(msg.content)
          ? (msg.content as { type: string; name?: string; text?: string; input?: unknown }[])
          : []
        const tools = blocks.filter((b) => b.type === 'tool_use')
        const text = blocks
          .filter((b) => b.type === 'text' && b.text)
          .map((b) => (b.text ?? '').slice(0, 200))
          .join(' ')
        if (tools.length > 0) {
          for (const t of tools) {
            const input = JSON.stringify(t.input ?? {}).slice(0, 150)
            console.log(`[classify] Turn ${String(turns)}: ${t.name ?? '?'}(${input})`)
          }
        } else if (text) {
          console.log(`[classify] Turn ${String(turns)}: ${text.slice(0, 200)}`)
        } else {
          console.log(`[classify] Turn ${String(turns)}: (no content)`)
        }
      }
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

  const { placements, newFamilies, unclassified: unc } = output
  console.log(
    `[classify] Done: ${String(placements.length)} placements, ` +
    `${String(newFamilies.length)} new families, ` +
    `${String(unc.length)} unclassified`,
  )
  for (const p of placements) {
    console.log(`  → ${p.modelId} → ${p.familyKey}[${String(p.genIndex)}] (${p.position})`)
  }
  for (const f of newFamilies) {
    console.log(`  + ${f.familyKey}: ${JSON.stringify(f.generations)}`)
  }
  if (unc.length > 0) {
    console.log(`  ? ${unc.join(', ')}`)
  }

  return {
    families: applyOutput(currentFamilies, output),
    unclassified: output.unclassified ?? [],
  }
}
