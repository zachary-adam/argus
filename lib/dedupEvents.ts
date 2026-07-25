import { IntelEvent } from '@/types'

const SEV_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 }

interface Prepared { ev: IntelEvent; t: number; words: Set<string>; fp: string }

function prepare(ev: IntelEvent): Prepared {
  const words = new Set(ev.title.toLowerCase().split(/\W+/).filter(w => w.length > 3))
  const fp = Array.from(words).sort().slice(0, 6).join('|')
  return { ev, t: new Date(ev.timestamp).getTime(), words, fp }
}

function wordOverlap(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0
  let intersection = 0
  for (const w of a) if (b.has(w)) intersection++
  return intersection / Math.min(a.size, b.size)
}

/**
 * Collapse near-duplicate reports of the SAME real-world event arriving from
 * different feeds (GDELT + RSS + targeted news, etc.) into one event — and,
 * crucially, RECORD the corroboration instead of silently dropping the dupes.
 *
 * The kept event's `corroborationCount` is set to the number of DISTINCT sources
 * that reported it. That figure is exactly what `eventConfidence()` and the AI
 * prompts already consume ("Corroboration ≥3 = well-confirmed"). Before this,
 * nothing populated it from live feeds, so every multi-source event looked
 * single-sourced and that confidence layer was dead weight.
 *
 * When merging we also keep the most severe report and the highest fatality
 * figure across the duplicates — under-counting either would be the wrong error
 * for an intelligence tool.
 *
 * Match rule (unchanged from the original inline dedup): same 1° geo cell,
 * within 24h, title word-overlap > 0.5. Same headline (fingerprint) is an O(1)
 * fast path. Kept events are mutated in place.
 */
export function deduplicateEvents(events: IntelEvent[]): IntelEvent[] {
  const prepared = events.map(prepare)

  // 1°×1° geographic bins — only compare events in adjacent cells.
  const bins = new Map<string, Prepared[]>()
  const addToBin = (p: Prepared) => {
    const key = `${Math.round(p.ev.lat)},${Math.round(p.ev.lon)}`
    if (!bins.has(key)) bins.set(key, [])
    bins.get(key)!.push(p)
  }

  const sourcesOf = new Map<IntelEvent, Set<string>>() // kept event -> distinct reporting sources
  const fpKeep = new Map<string, IntelEvent>()         // fingerprint -> kept event
  const result: IntelEvent[] = []

  const mergeInto = (keep: IntelEvent, dup: IntelEvent) => {
    let set = sourcesOf.get(keep)
    if (!set) { set = new Set([keep.source]); sourcesOf.set(keep, set) }
    set.add(dup.source)
    keep.corroborationCount = set.size // distinct corroborating sources (same source re-emitting doesn't inflate)
    if ((SEV_RANK[dup.severity] ?? 0) > (SEV_RANK[keep.severity] ?? 0)) keep.severity = dup.severity
    if ((dup.fatalities ?? 0) > (keep.fatalities ?? 0)) keep.fatalities = dup.fatalities
    if (!keep.summary && dup.summary) keep.summary = dup.summary
  }

  for (const p of prepared) {
    // Fast exact-fingerprint path — same headline re-emitted. Still require the
    // SAME dedup window (24h) and locality (~1°) as the slow path: a recurring
    // headline ("Protest in Nairobi") months or regions apart must stay DISTINCT,
    // otherwise we under-count separate incidents and inflate corroboration.
    if (p.fp && fpKeep.has(p.fp)) {
      const keep = fpKeep.get(p.fp)!
      const sameWindow = Math.abs(p.t - new Date(keep.timestamp).getTime()) <= 86_400_000
      const samePlace = Math.sqrt((p.ev.lat - keep.lat) ** 2 + (p.ev.lon - keep.lon) ** 2) <= 1
      if (sameWindow && samePlace) { mergeInto(keep, p.ev); continue }
      // else fall through to the geo/time slow path — treat as a distinct event
    }

    const binLat = Math.round(p.ev.lat)
    const binLon = Math.round(p.ev.lon)
    let match: Prepared | null = null
    outer: for (let dlat = -1; dlat <= 1; dlat++) {
      for (let dlon = -1; dlon <= 1; dlon++) {
        const nearby = bins.get(`${binLat + dlat},${binLon + dlon}`)
        if (!nearby) continue
        for (const q of nearby) {
          if (Math.abs(p.t - q.t) > 86_400_000) continue
          if (Math.sqrt((p.ev.lat - q.ev.lat) ** 2 + (p.ev.lon - q.ev.lon) ** 2) > 1) continue
          if (wordOverlap(p.words, q.words) > 0.5) { match = q; break outer }
        }
      }
    }

    if (match) {
      mergeInto(match.ev, p.ev)
    } else {
      result.push(p.ev)
      if (p.fp) fpKeep.set(p.fp, p.ev)
      addToBin(p)
    }
  }

  return result
}
