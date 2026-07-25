import type { BriefHistoryRecord } from '@/lib/briefRender'

const PREFIX = 'argus-brief-cache:'

export function cacheBriefsForProject(projectId: string, items: BriefHistoryRecord[]): void {
  try {
    const trimmed = items.slice(0, 20)
    sessionStorage.setItem(`${PREFIX}${projectId}`, JSON.stringify(trimmed))
  } catch { /* quota */ }
}

export function loadCachedBriefs(projectId: string): BriefHistoryRecord[] {
  try {
    const raw = sessionStorage.getItem(`${PREFIX}${projectId}`)
    if (!raw) return []
    return JSON.parse(raw) as BriefHistoryRecord[]
  } catch {
    return []
  }
}
