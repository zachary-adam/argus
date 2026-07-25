/**
 * Narrative threads — deterministic storylines derived from the graded corpus.
 *
 * A thread is what an analyst actually tracks: not one event, not the whole
 * feed, but an evolving strand — "post-poll violence in District X", "the TMC
 * symbol dispute". Threads are DERIVED by linking events on shared tracked
 * actors, place proximity, related reporting, and time — no LLM, no storage.
 * Every membership carries an audit trail (why this event joined), so the
 * analyst can challenge any link. Analyst permanence goes through the existing
 * Case tracker ("promote to case"); this layer stays a pure view of the corpus.
 *
 * Clustering is greedy and chronological: events are processed oldest-first
 * and join the best-scoring open thread (same result every run for the same
 * corpus — order-stable, deterministic).
 */
import type { TrackedActor } from '@/types/project'
import { matchActor, type ActorEvent } from '@/lib/actors'
import { storySimilar } from '@/lib/aimedIngest'
import { haversineDistance } from '@/lib/haversine'

export interface ThreadEvent extends ActorEvent {
  lat?: number
  lon?: number
  source?: string
  source_detail?: string
}

export interface ThreadLink {
  eventId: string
  /** Human-readable reasons this event joined — the audit trail. */
  reasons: string[]
}

export interface NarrativeThread {
  /** Stable for a given corpus: seeded from the thread's first event. */
  id: string
  /** Derived label: dominant actor · dominant place · dominant category. */
  label: string
  /** Chronological, oldest first. */
  events: ThreadEvent[]
  links: ThreadLink[]
  /** Names of tracked actors mentioned anywhere in the thread. */
  actorNames: string[]
  countries: string[]
  categories: string[]
  topSeverity: 'critical' | 'high' | 'medium' | 'low'
  firstAt: string
  lastAt: string
  /** Latest event within the last 7 days. */
  active: boolean
  /** Distinct reporting outlets — corroboration breadth, not a truth claim. */
  outlets: string[]
}

const SEV_RANK: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 }
// 5 means circumstance alone can't form a thread: country(1)+nearby(2)+category(1)=4
// stays apart. A join needs a shared tracked actor (+3) or related reporting (+3)
// on top of circumstance — geography glue was over-merging country-anchored feeds.
const JOIN_THRESHOLD = 5
const MAX_GAP_DAYS = 14
const NEARBY_KM = 150

interface OpenThread {
  events: ThreadEvent[]
  links: ThreadLink[]
  actorNames: Set<string>
  lastTs: number
}

function eventActors(e: ThreadEvent, tracked: TrackedActor[]): string[] {
  const structured = (e.actors ?? []).map(a => a.name).join(' ')
  const text = `${e.title} ${e.summary ?? ''} ${(e.body ?? '').slice(0, 2000)} ${structured}`
  return tracked.filter(a => matchActor(a, text)).map(a => a.name)
}

function scoreAgainst(
  e: ThreadEvent,
  eActors: string[],
  t: OpenThread,
): { score: number; reasons: string[] } {
  let score = 0
  const reasons: string[] = []

  const shared = eActors.filter(a => t.actorNames.has(a))
  if (shared.length > 0) {
    score += Math.min(shared.length, 2) * 3
    reasons.push(...shared.map(a => `actor: ${a}`))
  }

  const recent = t.events.slice(-5)
  if (recent.some(te => storySimilar(te.title, e.title))) {
    score += 3
    reasons.push('related reporting')
  }

  const sameCountry = e.country && recent.some(te => te.country === e.country)
  if (sameCountry) {
    score += 1
    reasons.push(`country: ${e.country}`)
  }

  if (typeof e.lat === 'number' && (e.lat !== 0 || e.lon !== 0)) {
    const near = recent.find(te =>
      typeof te.lat === 'number' && (te.lat !== 0 || te.lon !== 0) &&
      haversineDistance(e.lat!, e.lon ?? 0, te.lat!, te.lon ?? 0) <= NEARBY_KM,
    )
    if (near) {
      score += 2
      reasons.push('nearby location')
    }
  }

  if (e.category && recent.some(te => te.category === e.category)) {
    score += 1
    reasons.push(`category: ${e.category}`)
  }

  return { score, reasons }
}

function dominant(values: (string | undefined)[]): string | undefined {
  const freq = new Map<string, number>()
  for (const v of values) {
    if (!v) continue
    freq.set(v, (freq.get(v) ?? 0) + 1)
  }
  return [...freq.entries()].sort((a, b) => b[1] - a[1])[0]?.[0]
}

function threadLabel(t: OpenThread): string {
  const actor = dominant(t.events.flatMap(e => {
    const names = t.links.find(l => l.eventId === e.id)?.reasons
      .filter(r => r.startsWith('actor: ')).map(r => r.slice(7)) ?? []
    return names
  })) ?? [...t.actorNames][0]
  const place = dominant(t.events.map(e => e.country))
  const category = dominant(t.events.map(e => e.category))
  if (actor) {
    return [actor, place, category].filter(Boolean).join(' · ')
  }
  // No actor anchor — place·category alone collides between threads, so add the
  // storyline's own headline (shortest title reads most like a topic).
  const headline = [...t.events].sort((a, b) => a.title.length - b.title.length)[0]?.title ?? ''
  const prefix = [place, category].filter(Boolean).join(' · ')
  const short = headline.length > 100 ? `${headline.slice(0, 100)}…` : headline
  return prefix ? `${prefix} — ${short}` : (short || 'Thread')
}

function outletsFor(events: ThreadEvent[]): string[] {
  const seen = new Set<string>()
  const out: string[] = []
  for (const e of events) {
    const name = e.source_detail ?? e.source
    if (name && !seen.has(name)) { seen.add(name); out.push(name) }
  }
  return out
}

/**
 * Compact NARRATIVE THREADS prompt block for briefs. `orderedCorpus` MUST be
 * the exact [E#] tag order of the evidence corpus (index i ⇒ tag E{i+1}) so
 * every storyline the model reads is anchored to citable tags. Deterministic.
 */
export function threadBriefBlock(
  orderedCorpus: ThreadEvent[],
  tracked: TrackedActor[] = [],
  now: number = Date.now(),
): string {
  const threads = deriveThreads(orderedCorpus, tracked, { now })
  if (threads.length === 0) return ''
  const tagOf = new Map(orderedCorpus.map((e, i) => [e.id, `E${i + 1}`]))
  const lines = threads.slice(0, 6).map(t => {
    const tags = t.events.slice(0, 10).map(e => `[${tagOf.get(e.id)}]`).join('')
    const span = `${t.firstAt.slice(0, 10)} → ${t.lastAt.slice(0, 10)}`
    return `- ${t.label}: ${t.events.length} linked events ${tags} · ${t.active ? 'ACTIVE' : 'dormant'} · ${span} · ${t.outlets.length} outlet${t.outlets.length !== 1 ? 's' : ''} · top severity ${t.topSeverity}`
  })
  return [
    'NARRATIVE THREADS (deterministic — events linked by shared actors, related reporting, and proximity; every membership traces to its [E#] tags):',
    ...lines,
  ].join('\n')
}

/**
 * Derive narrative threads from the corpus. Pure; `now` injectable for tests.
 * Only strands with ≥ `minEvents` events surface — singletons are just events.
 * Sorted most-recently-active first.
 */
export function deriveThreads(
  events: ThreadEvent[],
  tracked: TrackedActor[] = [],
  opts: { minEvents?: number; now?: number } = {},
): NarrativeThread[] {
  const minEvents = opts.minEvents ?? 2
  const now = opts.now ?? Date.now()

  const chronological = [...events]
    .filter(e => e.id && e.title && !Number.isNaN(new Date(e.timestamp).getTime()))
    .sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())

  const open: OpenThread[] = []
  for (const e of chronological) {
    const ts = new Date(e.timestamp).getTime()
    const eActors = eventActors(e, tracked)

    let best: OpenThread | null = null
    let bestScore = 0
    let bestReasons: string[] = []
    for (const t of open) {
      if (ts - t.lastTs > MAX_GAP_DAYS * 86_400_000) continue
      const { score, reasons } = scoreAgainst(e, eActors, t)
      if (score >= JOIN_THRESHOLD && score > bestScore) {
        best = t; bestScore = score; bestReasons = reasons
      }
    }

    if (best) {
      best.events.push(e)
      best.links.push({ eventId: e.id, reasons: bestReasons })
      for (const a of eActors) best.actorNames.add(a)
      best.lastTs = ts
    } else {
      open.push({
        events: [e],
        links: [{ eventId: e.id, reasons: ['thread origin'] }],
        actorNames: new Set(eActors),
        lastTs: ts,
      })
    }
  }

  return open
    .filter(t => t.events.length >= minEvents)
    .map(t => {
      const topSeverity = (t.events
        .map(e => e.severity)
        .sort((a, b) => (SEV_RANK[a] ?? 4) - (SEV_RANK[b] ?? 4))[0] ?? 'low') as NarrativeThread['topSeverity']
      const lastAt = t.events[t.events.length - 1].timestamp
      return {
        id: `thread_${t.events[0].id}`,
        label: threadLabel(t),
        events: t.events,
        links: t.links,
        actorNames: [...t.actorNames],
        countries: [...new Set(t.events.map(e => e.country).filter((c): c is string => !!c))],
        categories: [...new Set(t.events.map(e => e.category).filter((c): c is string => !!c))],
        topSeverity,
        firstAt: t.events[0].timestamp,
        lastAt,
        active: now - new Date(lastAt).getTime() < 7 * 86_400_000,
        outlets: outletsFor(t.events),
      }
    })
    .sort((a, b) => new Date(b.lastAt).getTime() - new Date(a.lastAt).getTime())
}
