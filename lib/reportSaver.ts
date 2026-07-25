type ReportType = 'sitrep' | 'salute' | 'spotrep' | 'intsum' | 'brief'

export interface ReportSavePayload {
  type: ReportType
  title: string
  subject?: string
  bluf?: string
  situation?: string
  assessment?: string
  outlook?: string
  sources?: string
  notes?: string
  originator?: string
}

function makeId() { return Math.random().toString(36).slice(2, 9) }

function formatDTG(date: Date = new Date()): string {
  const d  = String(date.getUTCDate()).padStart(2, '0')
  const h  = String(date.getUTCHours()).padStart(2, '0')
  const m  = String(date.getUTCMinutes()).padStart(2, '0')
  const mo = ['JAN','FEB','MAR','APR','MAY','JUN','JUL','AUG','SEP','OCT','NOV','DEC'][date.getUTCMonth()]
  const yr = String(date.getUTCFullYear()).slice(2)
  return `${d}${h}${m}Z ${mo} ${yr}`
}

export function saveReportToStorage(payload: ReportSavePayload): void {
  if (typeof window === 'undefined') return
  try {
    // Read active project ID from Zustand persist state in localStorage
    const zustandRaw = localStorage.getItem('argus-project-store')
    let pid: string | null = null
    if (zustandRaw) {
      const z = JSON.parse(zustandRaw)
      pid = z?.state?.activeProjectId ?? null
    }
    const key = `argus-reports-${pid ?? 'global'}`
    const existing: unknown[] = JSON.parse(localStorage.getItem(key) ?? '[]')
    const report = {
      id:             makeId(),
      type:           payload.type,
      title:          payload.title,
      classification: 'UNCLASSIFIED' as const,
      status:         'final' as const,
      dtg:            formatDTG(),
      originator:     payload.originator ?? 'ARGUS AI',
      subject:        payload.subject ?? payload.title,
      createdAt:      new Date().toISOString(),
      updatedAt:      new Date().toISOString(),
      bluf:           payload.bluf ?? '',
      situation:      payload.situation ?? '',
      keyDevelopments: [],
      assessment:     payload.assessment ?? '',
      outlook:        payload.outlook ?? '',
      recommendations: '',
      sources:        payload.sources ?? '',
      notes:          payload.notes ?? '',
      salute_size: '', salute_activity: '', salute_location: '', salute_unit: '', salute_time: '', salute_equipment: '',
      spotrep_observation: '', spotrep_grid: '', spotrep_dtg: formatDTG(), spotrep_enemy: '', spotrep_own: '',
      sitrep_period: '', sitrep_friendly: '', sitrep_enemy: '', sitrep_terrain: '', sitrep_logistics: '',
    }
    localStorage.setItem(key, JSON.stringify([report, ...existing]))
  } catch {}
}
