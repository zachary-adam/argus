import type { Project } from '@/types/project'
import { threatBand, type ThreatBand } from '@/lib/threatLevel'

export type { ThreatBand }

export interface StationStats {
  eventCount: number
  criticalCount: number
  highCount: number
  threat: ThreatBand
  /** ISO codes joined for display, e.g. "ML · BF · NE". */
  codes: string
  /** SVG polyline points over a 200×34 viewBox — event volume over time. */
  sparkPoints: string
  /** Most severe recent event, for the cross-theater ticker. */
  topEvent: { title: string; band: 'critical' | 'high' } | null
}

// Same numeric banding the rest of the app uses (eventPersist, canvasExport, journalView).
function bandOf(sev: number): 'critical' | 'high' | 'medium' | 'low' {
  return sev >= 8 ? 'critical' : sev >= 6 ? 'high' : sev >= 4 ? 'medium' : 'low'
}

function sparkline(events: { timestamp: string }[], buckets = 9): string {
  const W = 200, H = 34, pad = 4
  const flat = `0,${H - pad} ${W},${H - pad}`
  const times = events
    .map(e => new Date(e.timestamp).getTime())
    .filter(Number.isFinite)
    .sort((a, b) => a - b)
  if (times.length < 2) return flat

  const min = times[0]
  const span = times[times.length - 1] - min
  if (span <= 0) return flat

  const counts = new Array(buckets).fill(0)
  for (const t of times) {
    const idx = Math.min(buckets - 1, Math.floor(((t - min) / span) * buckets))
    counts[idx]++
  }
  const peak = Math.max(...counts, 1)
  return counts
    .map((c, i) => {
      const x = Math.round((i / (buckets - 1)) * W)
      const y = Math.round(pad + (1 - c / peak) * (H - pad * 2))
      return `${x},${y}`
    })
    .join(' ')
}

export function stationStats(project: Project): StationStats {
  const events = project.events ?? []
  let criticalCount = 0
  let highCount = 0
  for (const e of events) {
    const b = bandOf(e.severity)
    if (b === 'critical') criticalCount++
    else if (b === 'high') highCount++
  }

  const threat = threatBand(criticalCount, highCount)

  const codes = (project.countryCodes ?? []).slice(0, 4).join(' · ').toUpperCase()

  const mostSevere = [...events].sort(
    (a, b) => b.severity - a.severity || (b.timestamp || '').localeCompare(a.timestamp || ''),
  )[0]
  const topEvent =
    mostSevere && mostSevere.severity >= 6
      ? { title: mostSevere.title, band: (mostSevere.severity >= 8 ? 'critical' : 'high') as 'critical' | 'high' }
      : null

  return {
    eventCount: events.length,
    criticalCount,
    highCount,
    threat,
    codes,
    sparkPoints: sparkline(events),
    topEvent,
  }
}
