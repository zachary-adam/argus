/**
 * Deterministic pattern engine — runs over IntelEvent[] with no AI.
 *
 * Every primitive emits a Pattern only when it has supporting evidence
 * (hits ≥ 2 by default). Patterns describe what was observed, never what
 * "will" happen — the wording in name/if/then reflects that.
 *
 * The functions are pure (no fetch, no LLM, no IO) so they're trivially
 * unit-testable and safe to run on the client.
 */
import type { IntelEvent } from '@/types'
import type { Pattern, PatternConfidence } from '@/types/project'

const DEFAULT_WINDOW_H = 48
const MIN_HITS = 2

const SEVERITY_RANK: Record<IntelEvent['severity'], number> = {
  low: 1, medium: 2, high: 3, critical: 4,
}

type EventCategory = IntelEvent['category']

function tsMs(ev: IntelEvent): number {
  const t = new Date(ev.timestamp).getTime()
  return Number.isFinite(t) ? t : 0
}

export function makePatternId(): string {
  return `pat_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
}

function deriveConfidence(hits: number, hitRate: number): PatternConfidence {
  if (hits >= 4 && hitRate >= 0.7) return 'high'
  if (hits >= 2 && hitRate >= 0.5) return 'moderate'
  return 'low'
}

function makePattern(p: {
  name: string
  ifClause: string
  thenClause: string
  source: Pattern['source']
  eventIds: string[]
  hits: number
  misses: number
  windowHours: number
}): Pattern {
  const total = p.hits + p.misses
  const hitRate = total > 0 ? p.hits / total : 0
  return {
    id: makePatternId(),
    name: p.name,
    if: p.ifClause,
    then: p.thenClause,
    source: p.source,
    evidence: { eventIds: Array.from(new Set(p.eventIds)).slice(0, 24) },
    hits: p.hits,
    misses: p.misses,
    hitRate,
    confidence: deriveConfidence(p.hits, hitRate),
    windowHours: p.windowHours,
    createdAt: new Date().toISOString(),
  }
}

// ── Primitive 1: category → category ─────────────────────────────────────────

export function categoryFollow(
  events: IntelEvent[],
  ifCat: EventCategory,
  thenCat: EventCategory,
  windowHours = DEFAULT_WINDOW_H,
): Pattern | null {
  if (ifCat === thenCat) return null
  const windowMs = windowHours * 3_600_000
  const triggers = events.filter(e => e.category === ifCat)
  if (triggers.length < MIN_HITS) return null

  let hits = 0
  let misses = 0
  const evidence: string[] = []
  for (const trig of triggers) {
    const t0 = tsMs(trig)
    if (!t0) continue
    const follow = events.find(f =>
      f.category === thenCat &&
      f.countryCode === trig.countryCode &&
      f.id !== trig.id &&
      tsMs(f) > t0 &&
      tsMs(f) - t0 <= windowMs,
    )
    if (follow) { hits++; evidence.push(trig.id, follow.id) }
    else misses++
  }
  if (hits < MIN_HITS) return null

  return makePattern({
    name: `${cap(ifCat)} precedes ${thenCat}`,
    ifClause: `An event of category "${ifCat}" occurs in a country`,
    thenClause: `An event of category "${thenCat}" follows in the same country within ${windowHours}h`,
    source: 'rules',
    eventIds: evidence,
    hits,
    misses,
    windowHours,
  })
}

// ── Primitive 2: actor → category ────────────────────────────────────────────

export function actorFollow(
  events: IntelEvent[],
  actorName: string,
  thenCat: EventCategory,
  windowHours = DEFAULT_WINDOW_H,
): Pattern | null {
  const windowMs = windowHours * 3_600_000
  const needle = actorName.trim().toLowerCase()
  if (!needle) return null
  const triggers = events.filter(e =>
    e.actors?.some(a => a.name.toLowerCase().includes(needle)),
  )
  if (triggers.length < MIN_HITS) return null

  let hits = 0
  let misses = 0
  const evidence: string[] = []
  for (const trig of triggers) {
    const t0 = tsMs(trig)
    if (!t0) continue
    const follow = events.find(f =>
      f.category === thenCat &&
      f.countryCode === trig.countryCode &&
      f.id !== trig.id &&
      tsMs(f) > t0 &&
      tsMs(f) - t0 <= windowMs,
    )
    if (follow) { hits++; evidence.push(trig.id, follow.id) }
    else misses++
  }
  if (hits < MIN_HITS) return null

  return makePattern({
    name: `${actorName} → ${thenCat}`,
    ifClause: `An event mentioning "${actorName}" occurs`,
    thenClause: `An event of category "${thenCat}" follows in the same country within ${windowHours}h`,
    source: 'rules',
    eventIds: evidence,
    hits,
    misses,
    windowHours,
  })
}

// ── Primitive 3: location escalation ────────────────────────────────────────

export function locationEscalation(
  events: IntelEvent[],
  countryCode: string,
  windowHours = DEFAULT_WINDOW_H,
): Pattern | null {
  const code = countryCode.toUpperCase()
  const windowMs = windowHours * 3_600_000
  const inCountry = events.filter(e => e.countryCode === code)
  if (inCountry.length < MIN_HITS) return null

  let hits = 0
  let misses = 0
  const evidence: string[] = []
  for (const trig of inCountry) {
    const t0 = tsMs(trig)
    if (!t0) continue
    const trigRank = SEVERITY_RANK[trig.severity] ?? 0
    const follow = inCountry.find(f =>
      f.id !== trig.id &&
      (SEVERITY_RANK[f.severity] ?? 0) > trigRank &&
      tsMs(f) > t0 &&
      tsMs(f) - t0 <= windowMs,
    )
    if (follow) { hits++; evidence.push(trig.id, follow.id) }
    else misses++
  }
  if (hits < MIN_HITS) return null

  const country = inCountry[0]?.country ?? code
  return makePattern({
    name: `Escalation in ${country}`,
    ifClause: `An event occurs in ${country}`,
    thenClause: `A higher-severity event in ${country} follows within ${windowHours}h`,
    source: 'rules',
    eventIds: evidence,
    hits,
    misses,
    windowHours,
  })
}

// ── Primitive 4: source spread ───────────────────────────────────────────────

export function sourceSpread(
  events: IntelEvent[],
  firstSource: IntelEvent['source'],
  thenSource: IntelEvent['source'],
  windowHours = DEFAULT_WINDOW_H,
): Pattern | null {
  if (firstSource === thenSource) return null
  const windowMs = windowHours * 3_600_000
  const triggers = events.filter(e => e.source === firstSource)
  if (triggers.length < MIN_HITS) return null

  let hits = 0
  let misses = 0
  const evidence: string[] = []
  for (const trig of triggers) {
    const t0 = tsMs(trig)
    if (!t0) continue
    const follow = events.find(f =>
      f.source === thenSource &&
      f.countryCode === trig.countryCode &&
      f.id !== trig.id &&
      tsMs(f) > t0 &&
      tsMs(f) - t0 <= windowMs,
    )
    if (follow) { hits++; evidence.push(trig.id, follow.id) }
    else misses++
  }
  if (hits < MIN_HITS) return null

  return makePattern({
    name: `${firstSource} → ${thenSource}`,
    ifClause: `An event is reported by "${firstSource}"`,
    thenClause: `"${thenSource}" reports an event in the same country within ${windowHours}h`,
    source: 'rules',
    eventIds: evidence,
    hits,
    misses,
    windowHours,
  })
}

// ── Primitive 5: cadence (no if/then — descriptive only) ─────────────────────

const WEEKDAY = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday']

export function cadence(events: IntelEvent[], category: EventCategory): Pattern | null {
  const inCat = events.filter(e => e.category === category)
  if (inCat.length < 5) return null

  const byDay = new Array(7).fill(0) as number[]
  const idsByDay: string[][] = Array.from({ length: 7 }, () => [])
  for (const e of inCat) {
    const t = new Date(e.timestamp)
    if (Number.isNaN(t.getTime())) continue
    const d = t.getUTCDay()
    byDay[d]++
    idsByDay[d].push(e.id)
  }
  const total = byDay.reduce((a, b) => a + b, 0)
  if (total === 0) return null
  const mean = total / 7
  const peaks = byDay
    .map((count, d) => ({ d, count, ids: idsByDay[d] }))
    .filter(x => x.count >= Math.max(2, mean * 1.5))
    .sort((a, b) => b.count - a.count)
    .slice(0, 2)
  if (peaks.length === 0) return null

  const days = peaks.map(p => WEEKDAY[p.d]).join(' / ')
  const hits = peaks.reduce((s, p) => s + p.count, 0)
  const misses = total - hits

  return makePattern({
    name: `${cap(category)} clusters on ${days}`,
    ifClause: `An event of category "${category}" is observed`,
    thenClause: `It tends to fall on ${days} (UTC)`,
    source: 'rules',
    eventIds: peaks.flatMap(p => p.ids),
    hits,
    misses,
    windowHours: 0,
  })
}

// ── Manual evaluator — analyst-authored if/then ──────────────────────────────

export interface ManualRule {
  ifCategory: EventCategory
  thenCategory: EventCategory
  windowHours?: number
  /** Optional human label; defaults to "{ifCat} → {thenCat}". */
  name?: string
}

// ── Advanced manual evaluator — multi-dimension trigger + follow-up ─────────
// Lets an analyst express richer "if X then Y within Δt" rules without
// dropping into code: category / actor / country / source on the trigger,
// plus a "severity escalates" follow-up that doesn't exist in the simple form.

export type RuleDim = 'category' | 'actor' | 'country' | 'source'
export type FollowDim = RuleDim | 'severityEscalates'

export interface AdvancedRule {
  triggerKind: RuleDim
  triggerValue: string
  followupKind: FollowDim
  /** Required unless followupKind = 'severityEscalates'. */
  followupValue?: string
  /** Optional country-code filter — both trigger and follow-up must occur in this country. */
  scopeCountryCode?: string
  windowHours?: number
  name?: string
}

function matchesDim(ev: IntelEvent, kind: RuleDim, value: string): boolean {
  const v = value.trim().toLowerCase()
  if (!v) return false
  if (kind === 'category') return ev.category === value
  if (kind === 'source')   return ev.source === value
  if (kind === 'country')  return ev.countryCode.toUpperCase() === value.toUpperCase()
  // actor
  return (ev.actors ?? []).some(a => a.name.toLowerCase().includes(v))
}

function describeDim(kind: RuleDim, value: string): string {
  if (kind === 'category') return `category "${value}"`
  if (kind === 'source')   return `source "${value}"`
  if (kind === 'country')  return `country ${value.toUpperCase()}`
  return `actor "${value}"`
}

export function evaluateAdvancedRule(events: IntelEvent[], rule: AdvancedRule): Pattern {
  const windowHours = rule.windowHours ?? DEFAULT_WINDOW_H
  const windowMs = windowHours * 3_600_000
  const scope = rule.scopeCountryCode?.toUpperCase()
  const corpus = scope ? events.filter(e => e.countryCode.toUpperCase() === scope) : events
  const triggers = corpus.filter(e => matchesDim(e, rule.triggerKind, rule.triggerValue))

  let hits = 0
  let misses = 0
  const evidence: string[] = []
  for (const trig of triggers) {
    const t0 = tsMs(trig)
    if (!t0) continue
    const trigRank = SEVERITY_RANK[trig.severity] ?? 0
    const follow = corpus.find(f => {
      if (f.id === trig.id) return false
      if (f.countryCode !== trig.countryCode) return false
      const ft = tsMs(f)
      if (!(ft > t0 && ft - t0 <= windowMs)) return false
      if (rule.followupKind === 'severityEscalates') {
        return (SEVERITY_RANK[f.severity] ?? 0) > trigRank
      }
      const value = (rule.followupValue ?? '').trim()
      if (!value) return false
      return matchesDim(f, rule.followupKind, value)
    })
    if (follow) { hits++; evidence.push(trig.id, follow.id) }
    else misses++
  }

  const thenDescr = rule.followupKind === 'severityEscalates'
    ? `a higher-severity event follows`
    : `an event with ${describeDim(rule.followupKind, rule.followupValue ?? '')} follows`
  const ifDescr = `An event with ${describeDim(rule.triggerKind, rule.triggerValue)} occurs`
  const scopeDescr = scope ? ` (scoped to ${scope})` : ''

  const total = hits + misses
  const hitRate = total > 0 ? hits / total : 0

  return {
    id: makePatternId(),
    name: rule.name ?? `${describeDim(rule.triggerKind, rule.triggerValue)} → ${rule.followupKind === 'severityEscalates' ? 'escalation' : describeDim(rule.followupKind, rule.followupValue ?? '')}`,
    if: `${ifDescr}${scopeDescr}`,
    then: `${thenDescr} in the same country within ${windowHours}h`,
    source: 'manual',
    evidence: { eventIds: Array.from(new Set(evidence)).slice(0, 24) },
    hits,
    misses,
    hitRate,
    confidence: deriveConfidence(hits, hitRate),
    windowHours,
    createdAt: new Date().toISOString(),
  }
}

export function evaluateManualRule(events: IntelEvent[], rule: ManualRule): Pattern | null {
  const base = categoryFollow(events, rule.ifCategory, rule.thenCategory, rule.windowHours)
  if (!base) {
    // Manual rules still return a "0 hits" record so the analyst can see the
    // claim failed against the data — that's the whole point of writing one.
    const windowHours = rule.windowHours ?? DEFAULT_WINDOW_H
    return {
      ...makePattern({
        name: rule.name ?? `${cap(rule.ifCategory)} → ${rule.thenCategory}`,
        ifClause: `An event of category "${rule.ifCategory}" occurs in a country`,
        thenClause: `An event of category "${rule.thenCategory}" follows in the same country within ${windowHours}h`,
        source: 'manual',
        eventIds: [],
        hits: 0,
        misses: events.filter(e => e.category === rule.ifCategory).length,
        windowHours,
      }),
    }
  }
  return { ...base, source: 'manual', name: rule.name ?? base.name }
}

// ── Bulk scan — runs all primitives over the corpus ──────────────────────────

export interface ScanOptions {
  windowHours?: number
  /** Cap corpus size for performance. */
  maxEvents?: number
  /** Max patterns returned after ranking. */
  maxResults?: number
  /** Minimum hit rate (0–1) to include a pattern. */
  minHitRate?: number
}

export function scanPatterns(events: IntelEvent[], opts: ScanOptions = {}): Pattern[] {
  const slice = opts.maxEvents ? events.slice(0, opts.maxEvents) : events
  const w = opts.windowHours ?? DEFAULT_WINDOW_H
  const maxResults = opts.maxResults ?? 12
  const minHitRate = opts.minHitRate ?? 0.5
  const found: Pattern[] = []

  // 1. Category → category (core analyst if/then)
  const presentCats = new Set<EventCategory>(slice.map(e => e.category))
  for (const a of presentCats) {
    for (const b of presentCats) {
      if (a === b) continue
      const p = categoryFollow(slice, a, b, w)
      if (p && p.hitRate >= minHitRate) found.push(p)
    }
  }

  // 2. Severity escalation in busy countries (top 8 by volume)
  const countryCounts = new Map<string, number>()
  for (const e of slice) {
    if (e.countryCode) countryCounts.set(e.countryCode, (countryCounts.get(e.countryCode) ?? 0) + 1)
  }
  const topCountries = [...countryCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
  for (const [code, n] of topCountries) {
    if (n < 3) continue
    const p = locationEscalation(slice, code, w)
    if (p && p.hitRate >= minHitRate) found.push(p)
  }

  const byName = new Map<string, Pattern>()
  for (const p of found) {
    const existing = byName.get(p.name)
    if (!existing || p.hits > existing.hits || (p.hits === existing.hits && p.hitRate > existing.hitRate)) {
      byName.set(p.name, p)
    }
  }

  return [...byName.values()]
    .sort((a, b) => b.hits - a.hits || b.hitRate - a.hitRate)
    .slice(0, maxResults)
}

/** @deprecated Use scanPatterns — kept for existing imports. */
export const scanAllPatterns = scanPatterns

function cap(s: string): string { return s.charAt(0).toUpperCase() + s.slice(1) }
