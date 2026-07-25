/**
 * Contradiction detection — deterministic figure divergence between RELATED events.
 *
 * When two reports in the same storyline give different casualty/arrest figures,
 * that is exactly what an analyst must catch before citing either. This extracts
 * numeric claims ("5 killed", "death toll rises to 12") with regexes — no LLM,
 * no judgment call — and flags divergence between events the caller already
 * established as related (a narrative thread).
 *
 * Honesty about time: casualty figures legitimately RISE as reporting matures,
 * so a later-higher figure is a normal progression and is NOT flagged. Flagged:
 *  - `conflicting` — different figures within the same 24h reporting window
 *  - `walkback`    — a later report gives a LOWER figure than an earlier one
 */

export interface NumericClaim {
  term: string
  value: number
}

export interface ClaimReport {
  eventId: string
  title: string
  timestamp: string
  value: number
}

export interface Contradiction {
  term: string
  kind: 'conflicting' | 'walkback'
  reports: ClaimReport[]   // chronological; the diverging figures
}

// Normalized claim vocabulary — synonyms collapse so "dead" vs "killed" compares.
const TERM_NORMAL: Record<string, string> = {
  killed: 'killed', dead: 'killed', died: 'killed', deaths: 'killed', fatalities: 'killed',
  injured: 'injured', wounded: 'injured', hurt: 'injured',
  arrested: 'arrested', detained: 'arrested',
  missing: 'missing',
  displaced: 'displaced', evacuated: 'displaced',
}
const TERM_RE = Object.keys(TERM_NORMAL).join('|')

// "5 killed", "12 people dead", "at least 7 injured"
const NUM_FIRST = new RegExp(`(\\d[\\d,]*)\\s+(?:people\\s+|persons\\s+|civilians\\s+|villagers\\s+|others\\s+)?(${TERM_RE})\\b`, 'gi')
// "death toll rises to 12", "toll now at 15"
const TOLL = /(?:death\s+toll|toll)\s+(?:\w+\s+){0,3}?(\d[\d,]*)/gi

function parseNum(s: string): number {
  return parseInt(s.replace(/,/g, ''), 10)
}

/** Extract normalized numeric claims from free text. Pure. */
export function extractClaims(text: string): NumericClaim[] {
  if (!text) return []
  const out: NumericClaim[] = []
  for (const m of text.matchAll(NUM_FIRST)) {
    const value = parseNum(m[1])
    const term = TERM_NORMAL[m[2].toLowerCase()]
    if (Number.isFinite(value) && term) out.push({ term, value })
  }
  for (const m of text.matchAll(TOLL)) {
    const value = parseNum(m[1])
    if (Number.isFinite(value)) out.push({ term: 'killed', value })
  }
  return out
}

interface ClaimEvent {
  id: string
  title: string
  summary?: string
  timestamp: string
}

const SAME_WINDOW_MS = 24 * 3_600_000

/**
 * Find figure divergences across a set of RELATED events (one thread).
 * Per event, the highest claim per term counts (an article citing "3 dead,
 * later 5 dead" means 5). Pure and deterministic.
 */
export function findContradictions(events: ClaimEvent[]): Contradiction[] {
  // term → chronological reports of that term
  const byTerm = new Map<string, ClaimReport[]>()
  for (const e of events) {
    const perTerm = new Map<string, number>()
    for (const c of extractClaims(`${e.title}. ${e.summary ?? ''}`)) {
      perTerm.set(c.term, Math.max(perTerm.get(c.term) ?? 0, c.value))
    }
    for (const [term, value] of perTerm) {
      if (!byTerm.has(term)) byTerm.set(term, [])
      byTerm.get(term)!.push({ eventId: e.id, title: e.title, timestamp: e.timestamp, value })
    }
  }

  const out: Contradiction[] = []
  for (const [term, reports] of byTerm) {
    if (reports.length < 2) continue
    const chrono = [...reports].sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime())
    for (let i = 1; i < chrono.length; i++) {
      const prev = chrono[i - 1]
      const cur = chrono[i]
      if (cur.value === prev.value) continue
      const gap = new Date(cur.timestamp).getTime() - new Date(prev.timestamp).getTime()
      if (gap <= SAME_WINDOW_MS) {
        out.push({ term, kind: 'conflicting', reports: [prev, cur] })
      } else if (cur.value < prev.value) {
        out.push({ term, kind: 'walkback', reports: [prev, cur] })
      }
      // later-higher outside the window = normal toll progression — not flagged
    }
  }
  return out
}
