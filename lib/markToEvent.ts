/**
 * Promote an analyst mark (a Plot) into a first-class IntelEvent so it flows into
 * the same engines real events do — correlation, velocity, actor, header threat
 * score, the map/timeline, and the AI analyses.
 *
 * A promoted mark is precise (geoPrecision='exact', the analyst placed it), so it
 * also feeds the proximity-based correlation rules. Country is derived from the
 * nearest known location so country-grouped rules (escalation, etc.) pick it up.
 */
import { IntelEvent, Plot } from '@/types'
import { KNOWN_LOCATIONS } from './locations'
import { codeToName } from './countryNames'
import { haversineDistance } from './haversine'
import { cleanNotes } from './plotNotes'

const CATEGORY_MAP: Record<string, IntelEvent['category']> = {
  military: 'conflict',
  infrastructure: 'conflict',
  political: 'political',
  economic: 'economic',
  humanitarian: 'humanitarian',
  intelligence: 'social',
  custom: 'social',
}

const THREAT_TO_SEVERITY: Record<string, IntelEvent['severity']> = {
  critical: 'critical', high: 'high', medium: 'medium', low: 'low', info: 'low',
}

/** Nearest known-location country to a coordinate, within 1500 km, else null. */
export function nearestCountry(lat: number, lon: number): { code: string; name: string } | null {
  let bestCode: string | null = null
  let bestDist = Infinity
  for (const loc of Object.values(KNOWN_LOCATIONS)) {
    const d = haversineDistance(lat, lon, loc.lat, loc.lng)
    if (d < bestDist) { bestDist = d; bestCode = loc.country }
  }
  if (!bestCode || bestDist > 1500) return null
  return { code: bestCode, name: codeToName(bestCode) ?? bestCode }
}

/** Centroid [lon, lat] of a plot's coordinates (handles point / zone / polygon). */
function plotCenter(plot: Plot): { lat: number; lon: number } {
  const c = plot.coordinates
  if (typeof c[0] === 'number') return { lon: c[0] as number, lat: c[1] as number }
  const pts = c as number[][]
  const lon = pts.reduce((s, p) => s + p[0], 0) / pts.length
  const lat = pts.reduce((s, p) => s + p[1], 0) / pts.length
  return { lon, lat }
}

export const MARK_EVENT_PREFIX = 'mark-'

/** Stable IntelEvent for a promoted plot. id is deterministic so re-promotion dedups. */
export function plotToEvent(plot: Plot): IntelEvent {
  const { lat, lon } = plotCenter(plot)
  const country = nearestCountry(lat, lon)
  const category = CATEGORY_MAP[plot.properties?.category ?? 'custom'] ?? 'social'
  const severity = THREAT_TO_SEVERITY[plot.properties?.threat_level ?? 'medium'] ?? 'medium'

  return {
    id: `${MARK_EVENT_PREFIX}${plot.id}`,
    source: 'analyst',
    category,
    title: plot.label || 'Analyst mark',
    summary: cleanNotes(plot.properties?.notes) || 'Analyst field observation (promoted mark).',
    lat,
    lon,
    country: country?.name ?? '',
    countryCode: country?.code ?? 'XX',
    geoPrecision: 'exact',
    severity,
    timestamp: plot.created_at || new Date().toISOString(),
    url: '',
    tags: ['analyst-mark'],
  } as IntelEvent
}
