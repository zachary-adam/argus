/** Persist a successful NLQ run. Returns id or null on failure. */
export async function saveNlqToHistory(input: {
  query: string
  summary: string
  appliedFilters?: string
  matchCount?: number
  projectId?: string
}): Promise<string | null> {
  try {
    const res = await fetch('/api/nlq-history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
    })
    if (!res.ok) return null
    const data = await res.json() as { id?: string }
    return data.id ?? null
  } catch {
    return null
  }
}

export async function fetchNlqHistory(projectId?: string, limit = 12): Promise<import('@/lib/nlqHistory').NlqHistoryRecord[]> {
  const qs = new URLSearchParams({ limit: String(limit) })
  if (projectId) qs.set('projectId', projectId)
  const res = await fetch(`/api/nlq-history?${qs}`)
  if (!res.ok) return []
  return res.json()
}
