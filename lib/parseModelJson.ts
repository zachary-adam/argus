/**
 * Extract a JSON object from an LLM text response. Handles markdown fences,
 * leading prose, and trailing commentary. Throws if no parseable object found.
 */
export function parseModelJson<T = Record<string, unknown>>(text: string): T {
  const raw = text.trim()
  if (!raw) throw new Error('No JSON in response')

  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1]?.trim()
  const candidates = [fenced, raw].filter(Boolean) as string[]

  for (const c of candidates) {
    try { return JSON.parse(c) as T } catch { /* try substring */ }
    const block = c.match(/\{[\s\S]*\}/)?.[0]
    if (block) {
      try { return JSON.parse(block) as T } catch { /* next candidate */ }
    }
  }
  throw new Error('No JSON in response')
}
