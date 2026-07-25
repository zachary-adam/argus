import type { CorrelationAlert, IntelEvent } from '@/types'
import type { Pattern, Project } from '@/types/project'
import { universalToIntel } from '@/lib/eventPersist'
import { hasValidGeo } from '@/lib/geo'
import { intelEventFromJournalEntry, resolveEvidenceEvents } from '@/lib/journalView'
import { scanPatterns } from '@/lib/patternRules'

/** Minimum events before pattern scan is meaningful. */
export const MIN_PATTERN_CORPUS = 8

/** Minimum supporting hits for a surfaced pattern. */
export const MIN_PATTERN_HITS = 3

/** Minimum trigger attempts (hits + misses) for statistical stability. */
export const MIN_PATTERN_TRIALS = 4

export function patternCorpusReady(count: number): boolean {
  return count >= MIN_PATTERN_CORPUS
}

/** Journal-curated events first, then supplemental live feed — same spirit as brief blended mode. */
export function buildPatternCorpus(project: Project | null | undefined, liveEvents: IntelEvent[]): IntelEvent[] {
  if (!project) return liveEvents.slice(0, 400)

  const curated = resolveEvidenceEvents(liveEvents, project, 'journal')
  const curatedIds = new Set(curated.map(e => e.id))

  const supplemental: IntelEvent[] = []
  const seen = new Set(curatedIds)

  for (const e of liveEvents) {
    if (!seen.has(e.id)) {
      seen.add(e.id)
      supplemental.push(e)
    }
  }
  for (const e of project.events ?? []) {
    const intel = universalToIntel(e)
    if (!seen.has(intel.id)) {
      seen.add(intel.id)
      supplemental.push(intel)
    }
  }

  // Boost journal-linked events: include snapshots even when not in live feed
  for (const entry of project.journal ?? []) {
    if (entry.kind !== 'event' || !entry.eventId) continue
    if (seen.has(entry.eventId)) continue
    const snap = intelEventFromJournalEntry(entry)
    if (snap) {
      seen.add(snap.id)
      supplemental.unshift(snap)
    }
  }

  const blended = [...curated, ...supplemental.slice(0, 200)]
  return blended.slice(0, 400)
}

export function patternDedupeKey(p: Pick<Pattern, 'if' | 'then' | 'name'>): string {
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim()
  const ifk = norm(p.if)
  const thenk = norm(p.then)
  if (ifk && thenk) return `${ifk}::${thenk}`
  return norm(p.name)
}

/** Merge patterns — keeps strongest hit count per if/then key; incoming wins ties on source priority. */
const SOURCE_RANK: Record<Pattern['source'], number> = {
  rules: 4,
  manual: 3,
  correlation: 2,
  ai: 1,
}

export function mergePatterns(existing: Pattern[], incoming: Pattern[]): Pattern[] {
  const map = new Map<string, Pattern>()
  const consider = (p: Pattern) => {
    const key = patternDedupeKey(p)
    const prev = map.get(key)
    if (!prev) {
      map.set(key, p)
      return
    }
    const better =
      p.hits > prev.hits
      || (p.hits === prev.hits && p.hitRate > prev.hitRate)
      || (p.hits === prev.hits && p.hitRate === prev.hitRate && SOURCE_RANK[p.source] > SOURCE_RANK[prev.source])
    if (better) map.set(key, { ...p, includeInBrief: p.includeInBrief ?? prev.includeInBrief })
  }
  for (const p of existing) consider(p)
  for (const p of incoming) consider(p)
  return [...map.values()].sort((a, b) => b.hits - a.hits || b.hitRate - a.hitRate)
}

export function qualifiesPattern(p: Pattern, corpusSize: number): boolean {
  const total = p.hits + p.misses
  const minRate = corpusSize < 20 ? 0.67 : 0.5
  return p.hits >= MIN_PATTERN_HITS && total >= MIN_PATTERN_TRIALS && p.hitRate >= minRate
}

export function scanPatternsStrict(events: IntelEvent[], opts?: Parameters<typeof scanPatterns>[1]): Pattern[] {
  if (!patternCorpusReady(events.length)) return []
  const raw = scanPatterns(events, { minHitRate: events.length < 20 ? 0.67 : 0.5, ...opts })
  return raw.filter(p => qualifiesPattern(p, events.length))
}

export function correlationAlertToPattern(alert: CorrelationAlert): Pattern {
  return {
    id: `corr_${alert.id}`,
    name: alert.pattern || alert.title,
    if: alert.signals[0] ?? alert.title,
    then: alert.summary,
    source: 'correlation',
    evidence: { eventIds: [] },
    hits: alert.signalCount,
    misses: 0,
    hitRate: 1,
    confidence: alert.severity === 'critical' ? 'high' : alert.severity === 'high' ? 'moderate' : 'low',
    windowHours: 48,
    createdAt: alert.timestamp,
    correlationAlertId: alert.id,
  }
}

/** Live correlation alerts not already represented in saved patterns. */
export function novelCorrelationPatterns(saved: Pattern[], alerts: CorrelationAlert[]): Pattern[] {
  const keys = new Set(saved.map(patternDedupeKey))
  const ids = new Set(saved.map(p => p.correlationAlertId).filter(Boolean))
  return alerts
    .filter(a => !ids.has(a.id))
    .map(correlationAlertToPattern)
    .filter(p => !keys.has(patternDedupeKey(p)))
}

export function resolvePatternEvidence(
  pattern: Pattern,
  corpus: IntelEvent[],
): IntelEvent[] {
  const byId = new Map(corpus.map(e => [e.id, e]))
  return pattern.evidence.eventIds.map(id => byId.get(id)).filter(Boolean) as IntelEvent[]
}

export function flyToPatternEvidence(
  pattern: Pattern,
  corpus: IntelEvent[],
  actions: {
    flyTo: (lat: number, lon: number, zoom?: number) => void
    setSelectedEvent: (e: IntelEvent | null) => void
  },
): IntelEvent | null {
  for (const ev of resolvePatternEvidence(pattern, corpus)) {
    if (hasValidGeo(ev.lat, ev.lon)) {
      actions.flyTo(ev.lat, ev.lon, 6)
      actions.setSelectedEvent(ev)
      return ev
    }
  }
  return null
}
