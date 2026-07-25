import { IntelEvent } from '@/types'
import { Targeting } from '@/types/project'
import { defaultKeywordsForGoal } from '@/lib/goalTemplates'
import { COUNTRY_CODE_TO_NAME } from '@/lib/countryNames'

export interface RelevanceResult {
  score: number          // 0-100, for ranking
  matched: string[]      // human-readable matched terms (why it's relevant)
  entityMatch: boolean   // hit a watched person/party/group (specific, strong)
  placeMatch: boolean    // hit the targeted place name (specific, strong)
  keywordMatch: boolean  // hit a topic keyword (generic, weak on its own)
}

function hay(e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country'>): string {
  return `${e.title} ${e.summary} ${e.body ?? ''} ${e.country}`.toLowerCase()
}

/** Generic place tokens that must not alone count as a place hit ("Nagar", "City"). */
const PLACE_STOP = new Set([
  'nagar', 'city', 'town', 'village', 'district', 'county', 'province', 'state',
  'region', 'area', 'zone', 'north', 'south', 'east', 'west', 'new', 'old',
  'the', 'and', 'of', 'de', 'la', 'le', 'el',
])

/** Significant tokens from "Jamia Nagar, Delhi" → ["jamia"] (not "nagar"). */
export function placeMatchTokens(placeName: string): string[] {
  const city = placeName.split(',')[0]?.trim().toLowerCase() ?? ''
  if (!city) return []
  const parts = city.split(/\s+/).map(p => p.trim()).filter(Boolean)
  const out: string[] = []
  if (city.length > 2) out.push(city)
  for (const p of parts) {
    if (p.length >= 4 && !PLACE_STOP.has(p)) out.push(p)
  }
  return [...new Set(out)]
}

/** True when event text names a country in the area of responsibility. */
export function textMentionsAor(text: string, countryCodes: string[]): boolean {
  const t = text.toLowerCase()
  for (const code of countryCodes) {
    const name = COUNTRY_CODE_TO_NAME[code.toUpperCase()]
    if (name && t.includes(name.toLowerCase())) return true
  }
  return false
}

function eventInAor(
  e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country' | 'countryCode'>,
  targetCountryCodes?: string[],
): boolean {
  if (!targetCountryCodes?.length) return false
  if (e.countryCode && targetCountryCodes.includes(e.countryCode)) return true
  return textMentionsAor(hay(e), targetCountryCodes)
}

/**
 * Score how relevant an event is to a project's political situation.
 *
 * This is the TOPIC/ACTOR layer that was missing — geography is handled
 * separately (region radius). The key nuance: a generic keyword ("violence",
 * "election") matching is NOT enough on its own, because those words appear
 * worldwide. A *watched entity* (party/person) or the *place name* is a strong,
 * specific signal; a bare keyword only counts as corroboration.
 */
export function situationRelevance(
  e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country'>,
  t: Targeting | undefined,
): RelevanceResult {
  const empty: RelevanceResult = { score: 0, matched: [], entityMatch: false, placeMatch: false, keywordMatch: false }
  if (!t) return empty

  const text = hay(e)
  const matched: string[] = []
  let score = 0, entityMatch = false, placeMatch = false, keywordMatch = false

  for (const ent of t.watchEntities ?? []) {
    const en = ent.trim().toLowerCase()
    if (en && text.includes(en)) { entityMatch = true; score += 45; matched.push(ent) }
  }
  if (t.placeName) {
    const tokens = placeMatchTokens(t.placeName)
    const hit = tokens.find(tok => text.includes(tok))
    if (hit) {
      placeMatch = true
      score += 30
      matched.push(t.placeName.split(',')[0].trim())
    }
  }
  for (const kw of t.keywords ?? []) {
    const k = kw.trim().toLowerCase()
    if (k && text.includes(k)) { keywordMatch = true; score += 15; matched.push(kw) }
  }

  return { score: Math.min(100, score), matched, entityMatch, placeMatch, keywordMatch }
}

/**
 * Should this event survive into a political project's feed?
 *
 * - No meaningful targeting defined ⇒ can't judge topic relevance ⇒ keep it.
 * - A specific hit (watched entity or place) ⇒ relevant, even if out-of-country.
 * - Out-of-country with no specific hit ⇒ NOT relevant (keeps "Haiti gang violence"
 *   out of a West-Bengal feed).
 * - In the area of responsibility ⇒ relevant ONLY if it's on-topic (a keyword) or a
 *   core political/security event. A celebrity knee surgery or a sports result that
 *   merely happens to be in-country is dropped — that's national noise, not the
 *   situation.
 */
const CORE_CATEGORIES = new Set(['conflict', 'political', 'military', 'cyber'])

export function isSituationRelevant(
  e: Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country' | 'countryCode'> & { category?: string },
  t: Targeting | undefined,
  targetCountryCodes?: string[],
): boolean {
  const hasTargeting = !!t && ((t.keywords?.length ?? 0) > 0 || (t.watchEntities?.length ?? 0) > 0 || !!t.placeName)
  if (!hasTargeting) return true

  const r = situationRelevance(e, t)
  if (r.entityMatch || r.placeMatch) return true // specific hit — relevant anywhere

  if (!eventInAor(e, targetCountryCodes)) return false

  // In-AOR: must be on-topic (keyword) OR a core political/security event.
  return r.keywordMatch || (!!e.category && CORE_CATEGORIES.has(e.category))
}

interface ProjectLike {
  targeting?: Targeting
  goalTemplateId?: string
  countryCodes?: string[]
}

/**
 * The targeting actually used for filtering. Projects created before keyword
 * seeding (or with empty targeting) fall back to their goal's default keywords AT
 * FILTER TIME, so an existing project scopes itself without mutating saved data.
 */
export function effectiveTargeting(project: { targeting?: Targeting; goalTemplateId?: string }): Targeting | undefined {
  const t = project.targeting
  if (t && (t.keywords?.length ?? 0) > 0) return t
  const kw = defaultKeywordsForGoal(project.goalTemplateId)
  if (kw.length === 0) return t
  return { ...(t ?? { scope: 'regional', watchEntities: [] }), keywords: kw }
}

type RelevanceInput = Pick<IntelEvent, 'title' | 'summary' | 'body' | 'country' | 'countryCode'> & { category?: string }

/**
 * Drop events that aren't on-situation for a project. Single entry point shared by
 * the live stream and the manual connector pulls so both apply the SAME gate — a
 * keyword/place/entity firehose (e.g. a loose Guardian "Sudan" search returning
 * UK politics and climate features) gets scoped down before it reaches the analyst.
 * No-ops (keeps everything) when the project has no meaningful targeting.
 */
export function filterRelevantForProject<E extends RelevanceInput>(events: E[], project: ProjectLike): E[] {
  const t = effectiveTargeting(project)
  return events.filter(e => isSituationRelevant(e, t, project.countryCodes))
}
