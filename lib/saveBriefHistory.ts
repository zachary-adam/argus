import { briefSummary, type BriefHistoryType } from '@/lib/briefRender'

export interface SaveBriefInput {
  type: BriefHistoryType
  title: string
  country?: string
  countryCode?: string
  projectId?: string
  brief: Record<string, unknown>
  summary?: string
}

/** Persist a generated brief to server-side history. Returns id or null on failure. */
export async function saveBriefToHistory(input: SaveBriefInput): Promise<string | null> {
  try {
    const res = await fetch('/api/briefs', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: input.type,
        title: input.title,
        country: input.country ?? '',
        countryCode: input.countryCode ?? '',
        projectId: input.projectId,
        brief: input.brief,
        summary: input.summary ?? briefSummary(input.type, input.brief),
      }),
    })
    if (!res.ok) return null
    const data = await res.json() as { id?: string }
    return data.id ?? null
  } catch {
    return null
  }
}
