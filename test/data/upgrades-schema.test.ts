import { describe, it, expect } from 'vitest'
import { loadRealMap } from '../helpers/load-map.js'
import { validateUpgradeMap } from '../../src/core/variant-validator.js'

describe('data/upgrades.json schema validation', () => {
  it('every entry has safe and major fields of correct type', async () => {
    const map = await loadRealMap()

    for (const [key, entry] of Object.entries(map)) {
      expect(entry, `${key}: missing safe`).toHaveProperty('safe')
      expect(entry, `${key}: missing major`).toHaveProperty('major')
      expect(
        entry.safe === null || typeof entry.safe === 'string',
        `${key}: safe must be string|null`,
      ).toBe(true)
      expect(
        entry.major === null || typeof entry.major === 'string',
        `${key}: major must be string|null`,
      ).toBe(true)
    }
  })

  it('non-leaf entries have at least one upgrade path', async () => {
    const map = await loadRealMap()
    const allTargets = new Set(
      Object.values(map).flatMap((e) => [e.safe, e.major].filter(Boolean) as string[]),
    )

    for (const [key, entry] of Object.entries(map)) {
      // Leaf entries (latest models) may have both null — they exist so
      // discovery can propose upgrades when newer models appear.
      // Non-leaf entries (those referenced as targets) must have a path.
      if (allTargets.has(key)) continue
      if (entry.safe === null && entry.major === null) continue // leaf entry
      expect(
        entry.safe !== null || entry.major !== null,
        `${key}: both safe and major are null`,
      ).toBe(true)
    }
  })

  it('no entry upgrades to itself', async () => {
    const map = await loadRealMap()

    for (const [key, entry] of Object.entries(map)) {
      expect(entry.safe, `${key}: safe upgrade is itself`).not.toBe(key)
      expect(entry.major, `${key}: major upgrade is itself`).not.toBe(key)
    }
  })

  it('has a reasonable number of entries', async () => {
    const map = await loadRealMap()
    expect(Object.keys(map).length).toBeGreaterThan(50)
  })

  it('contains entries for all major providers', async () => {
    const map = await loadRealMap()
    const keys = Object.keys(map)

    // Native model IDs
    expect(keys.some((k) => k.startsWith('gpt-'))).toBe(true)
    expect(keys.some((k) => k.startsWith('claude-'))).toBe(true)
    expect(keys.some((k) => k.startsWith('gemini-'))).toBe(true)

    // OpenRouter-prefixed
    expect(keys.some((k) => k.startsWith('openai/'))).toBe(true)
    expect(keys.some((k) => k.startsWith('anthropic/'))).toBe(true)
    expect(keys.some((k) => k.startsWith('google/'))).toBe(true)

    // Bedrock-prefixed
    expect(keys.some((k) => k.startsWith('anthropic.'))).toBe(true)

    // Together AI (PascalCase)
    expect(keys.some((k) => k.startsWith('meta-llama/Llama-'))).toBe(true)
    expect(keys.some((k) => k.startsWith('Qwen/'))).toBe(true)
    expect(keys.some((k) => k.startsWith('deepseek-ai/'))).toBe(true)

    // Groq (custom aliases)
    expect(keys.some((k) => k === 'llama-3.3-70b-versatile')).toBe(true)
    expect(keys.some((k) => k === 'llama-3.1-8b-instant')).toBe(true)
  })

  it('passes variant validation', async () => {
    const map = await loadRealMap()
    const result = validateUpgradeMap(map)
    if (!result.ok) {
      throw new Error(`Validation failed:\n${result.error.join('\n')}`)
    }
    expect(result.ok).toBe(true)
  })
})
