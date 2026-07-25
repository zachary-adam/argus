import type { IntelEvent } from '@/types'
import type { Targeting } from '@/types/project'
import { matchKnownActors } from '@/lib/actorMatch'
import { codeToName } from '@/lib/countryNames'
import { detectLang } from '@/lib/lang'

export interface EvidenceGap {
  type: 'entity' | 'country' | 'volume' | 'language' | 'source'
  label: string
  detail: string
  recommendation: string
}

export interface EvidenceBalance {
  /** 0–100 completeness score for the current corpus vs mission. */
  score: number
  confidenceCap: 'HIGH' | 'MODERATE' | 'LOW'
  gaps: EvidenceGap[]
  entityCoverage: Record<string, number>
  countryCoverage: Record<string, number>
}

// Loose slice: summary/countryCode/source may be missing or non-canonical when
// the caller is the analyst canvas or an offline path. eventText handles undefined.
type EventSlice = {
  title: string
  summary?: string
  country: string
  countryCode?: string
  source?: IntelEvent['source'] | string
}

function eventText(e: EventSlice): string {
  return `${e.title} ${e.summary ?? ''}`
}

/**
 * Measure how balanced the workspace evidence is against the mission — generic for
 * any project. Drives honest brief confidence and collection recommendations.
 */
export function assessEvidenceBalance(
  events: EventSlice[],
  opts: {
    watchEntities?: string[]
    countryCodes?: string[]
    minEvents?: number
  } = {},
): EvidenceBalance {
  const entities = (opts.watchEntities ?? []).map(s => s.trim()).filter(Boolean)
  const codes = [...new Set((opts.countryCodes ?? []).map(c => c.toUpperCase()).filter(c => c && c !== 'XX'))]
  const minEvents = opts.minEvents ?? 12

  const entityCoverage: Record<string, number> = {}
  for (const ent of entities) {
    entityCoverage[ent] = events.filter(e => matchKnownActors(eventText(e), [ent]).length > 0).length
  }

  const countryCoverage: Record<string, number> = {}
  for (const code of codes) {
    countryCoverage[code] = events.filter(e => (e.countryCode ?? '').toUpperCase() === code).length
  }

  const gaps: EvidenceGap[] = []

  if (events.length < minEvents) {
    gaps.push({
      type: 'volume',
      label: 'Thin evidence base',
      detail: `${events.length} events on canvas — below ~${minEvents} for a forward assessment`,
      recommendation: 'Run aimed collect again or add RSS sources; widen keywords slightly if recall is zero',
    })
  }

  for (const ent of entities) {
    if ((entityCoverage[ent] ?? 0) === 0) {
      gaps.push({
        type: 'entity',
        label: `No ${ent} coverage`,
        detail: `Watch entity "${ent}" has zero mentions in the current event set`,
        recommendation: `Add an actor lens: search "${ent}" + place/keywords; consider local-language news for that actor's state media`,
      })
    }
  }

  if (codes.length >= 2) {
    const covered = codes.filter(c => (countryCoverage[c] ?? 0) > 0)
    if (covered.length < codes.length) {
      for (const code of codes.filter(c => (countryCoverage[c] ?? 0) === 0)) {
        const name = codeToName(code) ?? code
        gaps.push({
          type: 'country',
          label: `No ${name} events`,
          detail: `Project spans ${codes.join('/')} but no events geotagged to ${code}`,
          recommendation: `Pull ${name} local-language Google News (gl=${code}) with mission keywords — bilateral questions need both sides`,
        })
      }
    } else {
      // Every country has ≥1 event here (the zero case is handled above), so we
      // only need to flag heavy skew between them.
      const counts = codes.map(c => countryCoverage[c] ?? 0)
      const max = Math.max(...counts, 1)
      const min = Math.min(...counts)
      if (max >= 5 && min > 0 && max / min >= 4) {
        gaps.push({
          type: 'country',
          label: 'Skewed country balance',
          detail: `Event ratio across project countries is heavily uneven (${counts.join(' vs ')})`,
          recommendation: 'Treat assessment as provisional; add reporting from the under-represented country',
        })
      }
    }
  }

  const langs = new Set(events.map(e => detectLang(e.title)).filter(l => l !== 'en'))
  if (codes.some(c => ['CN', 'RU', 'IR', 'KP', 'SA', 'SY'].includes(c)) && langs.size === 0 && events.length >= 5) {
    gaps.push({
      type: 'language',
      label: 'English-only corpus',
      detail: 'Mission includes non-English primary states but all titles appear Latin-script/English',
      recommendation: 'Enable local-language news editions (hi, zh, fa, ru, etc.) — most local reporting is not in English',
    })
  }

  const sources = new Set(events.map(e => e.source))
  if (events.length >= 8 && sources.size <= 2) {
    gaps.push({
      type: 'source',
      label: 'Low source diversity',
      detail: `${events.length} events from only ${sources.size} connector type(s): ${[...sources].join(', ')}`,
      recommendation: 'Add structured connectors (ACLED, ReliefWeb) and alternate RSS feeds before publishing',
    })
  }

  // Score: start at 100, subtract for gaps (weighted).
  let score = 100
  for (const g of gaps) {
    if (g.type === 'volume') score -= 25
    else if (g.type === 'entity') score -= 12
    else if (g.type === 'country') score -= 15
    else if (g.type === 'language') score -= 8
    else if (g.type === 'source') score -= 6
  }
  score = Math.max(0, Math.min(100, score))

  const confidenceCap: EvidenceBalance['confidenceCap'] =
    score >= 75 && gaps.filter(g => g.type === 'entity' || g.type === 'country').length === 0
      ? 'HIGH'
      : score >= 45
        ? 'MODERATE'
        : 'LOW'

  return { score, confidenceCap, gaps, entityCoverage, countryCoverage }
}

export function evidenceBalanceToPrompt(
  balance: EvidenceBalance,
  targeting?: Targeting,
): string {
  if (balance.gaps.length === 0) return 'EVIDENCE BALANCE: Adequate for mission scope — state confidence based on ACH and corroboration.'
  const lines = [
    `EVIDENCE BALANCE SCORE: ${balance.score}/100 — confidence MUST NOT exceed ${balance.confidenceCap} unless gaps below are explicitly addressed.`,
    ...balance.gaps.slice(0, 6).map(g => `- [${g.type.toUpperCase()}] ${g.label}: ${g.detail}`),
  ]
  if (targeting?.watchEntities?.length) {
    const missing = targeting.watchEntities.filter(e => (balance.entityCoverage[e] ?? 0) === 0)
    if (missing.length) lines.push(`Missing watch entities in corpus: ${missing.join(', ')}`)
  }
  lines.push('If evidence is one-sided, say so plainly in confidenceRationale — do not infer the absent side.')
  return lines.join('\n')
}
