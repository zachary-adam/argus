import { IntelEvent } from '@/types'

export function wordOverlap(a: string, b: string): number {
  const setA = new Set(a.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const setB = new Set(b.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  if (setA.size === 0 || setB.size === 0) return 0
  const intersection = Array.from(setA).filter(w => setB.has(w)).length
  return intersection / Math.min(setA.size, setB.size)
}

/**
 * Returns true if `ev` is a near-duplicate of anything in `existing`.
 * Criteria: within 24 h + within ~111 km (1° arc) + >50% word overlap in title.
 */
export function isDuplicate(ev: IntelEvent, existing: IntelEvent[]): boolean {
  return existing.some(ex => {
    if (Math.abs(new Date(ev.timestamp).getTime() - new Date(ex.timestamp).getTime()) > 86400000) return false
    if (Math.sqrt((ev.lat - ex.lat) ** 2 + (ev.lon - ex.lon) ** 2) > 1) return false
    return wordOverlap(ev.title, ex.title) > 0.5
  })
}

/**
 * Filter `incoming` to only events not already in `existing`, by ID or semantic match.
 */
export function deduplicateIncoming(incoming: IntelEvent[], existing: IntelEvent[]): IntelEvent[] {
  const existingIds = new Set(existing.map(e => e.id))
  return incoming.filter(ev => !existingIds.has(ev.id) && !isDuplicate(ev, existing))
}
