import type { Forecast } from '@/lib/forecasting'
import type { Project } from '@/types/project'

export function readLegacyForecasts(): Forecast[] {
  if (typeof localStorage === 'undefined') return []
  try {
    const raw = localStorage.getItem('argus-forecasts')
    if (!raw) return []
    const parsed = JSON.parse(raw) as { state?: { forecasts?: Forecast[] }; forecasts?: Forecast[] }
    return parsed.state?.forecasts ?? parsed.forecasts ?? []
  } catch {
    return []
  }
}

/** One-time merge of localStorage forecast ledger into matching projects. */
export function migrateForecastsToProjects(projects: Project[], legacy: Forecast[]): Project[] {
  if (legacy.length === 0) return projects
  const byProject = new Map<string, Forecast[]>()
  for (const f of legacy) {
    if (!f.projectId) continue
    const list = byProject.get(f.projectId) ?? []
    list.push({ ...f, projectId: undefined })
    byProject.set(f.projectId, list)
  }
  if (byProject.size === 0) return projects

  return projects.map(p => {
    const incoming = byProject.get(p.id)
    if (!incoming?.length) return p
    const existing = new Set((p.forecasts ?? []).map(f => f.id))
    const merged = [...incoming.filter(f => !existing.has(f.id)), ...(p.forecasts ?? [])]
    return { ...p, forecasts: merged }
  })
}
