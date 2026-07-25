import { KNOWN_LOCATIONS } from './locations'
import { matchKnownActors } from './actorMatch'

export function stripHtml(html: string): string {
  return html
    .replace(/<[^>]*>/g, ' ')
    // Numeric hex entities first (&#x27; &#x2019; etc.)
    .replace(/&#x([0-9a-fA-F]+);/gi, (_, c) => String.fromCharCode(parseInt(c, 16)))
    // Numeric decimal entities (&#039; &#8216; &#8217; &#8220; &#8221; etc.)
    .replace(/&#(\d+);/g, (_, c) => String.fromCharCode(parseInt(c, 10)))
    // Named entities
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'")
    .replace(/\s{2,}/g, ' ').trim()
}

function uuidv4(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) return crypto.randomUUID()
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, c => {
    const r = Math.random() * 16 | 0
    return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16)
  })
}

export type SourceType = 'official' | 'independent' | 'social' | 'economic' | 'user'
export type SeverityLevel = 'critical' | 'high' | 'medium' | 'low' | 'info'
export type EventCategory =
  | 'conflict' | 'political' | 'economic' | 'humanitarian' | 'environmental'
  | 'health' | 'technology' | 'social' | 'military' | 'diplomatic'

export interface NormalizedEvent {
  id: string
  title: string
  description: string
  timestamp: string
  location: { name: string; lat?: number; lng?: number; country?: string; region?: string }
  actors: string[]
  categories: EventCategory[]
  severity: SeverityLevel
  source: { name: string; type: SourceType; url?: string; credibility: number }
  raw?: Record<string, unknown>
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

// Precompiled word-boundary matchers, longest key first so the most specific place
// wins (e.g. "south sudan" beats "sudan", "port sudan" beats nothing-bare-"port").
// Word boundaries (not substring) are critical: plain `includes()` matched "lima"
// inside "climate" and "hama" inside "hamas", plotting events in the wrong country.
const LOCATION_MATCHERS: Array<{
  key: string
  data: { lat: number; lng: number; country: string; region: string }
  re: RegExp
}> = Object.entries(KNOWN_LOCATIONS)
  .sort((a, b) => b[0].length - a[0].length)
  .map(([key, data]) => ({ key, data, re: new RegExp(`\\b${escapeRegExp(key)}\\b`, 'i') }))

export function extractLocation(text: string): NormalizedEvent['location'] {
  for (const { key, data, re } of LOCATION_MATCHERS) {
    if (re.test(text)) {
      return {
        name: key.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' '),
        lat: data.lat, lng: data.lng, country: data.country, region: data.region,
      }
    }
  }
  return { name: 'Unknown' }
}

export function inferCategories(text: string): EventCategory[] {
  const lower = text.toLowerCase()
  const map: Record<EventCategory, string[]> = {
    conflict:     ['war','attack','strike','bomb','clash','fighting','battle','violence','shooting','explosion'],
    military:     ['military','troops','army','forces','missile','drone','soldier','defense','navy','air force'],
    political:    ['election','parliament','president','government','minister','political','vote','policy'],
    diplomatic:   ['diplomatic','summit','treaty','ambassador','negotiations','bilateral','talks','agreement','sanctions'],
    economic:     ['economy','trade','market','gdp','inflation','oil','gas','currency','tariff','export','import'],
    humanitarian: ['refugees','displaced','humanitarian','aid','crisis','famine','food','shelter','relief'],
    environmental:['climate','flood','earthquake','drought','pollution','disaster','wildfire','hurricane','tsunami'],
    health:       ['pandemic','disease','outbreak','health','hospital','medical','vaccine','virus','epidemic'],
    technology:   ['cyber','hack','technology','ai','nuclear','space','digital','internet','satellite'],
    social:       ['protest','demonstration','unrest','riot','social','civil','rights','ethnic','religious'],
  }
  const cats: EventCategory[] = []
  for (const [cat, keywords] of Object.entries(map)) {
    if (keywords.some(kw => lower.includes(kw))) cats.push(cat as EventCategory)
  }
  return cats.length > 0 ? cats.slice(0, 3) : ['political']
}

export function inferSeverity(text: string): SeverityLevel {
  const lower = text.toLowerCase()
  const critical = ['killed','dead','deaths','massacre','genocide','nuclear','war declared','invasion','coup','martial law','state of emergency']
  const high = ['attack','explosion','bomb','missile','casualties','crisis','emergency','violence','protest','riots','crackdown','arrested']
  const low = ['ceasefire','peace','agreement','cooperation','aid delivered']
  if (critical.some(w => lower.includes(w))) return 'critical'
  if (high.some(w => lower.includes(w))) return 'high'
  if (low.some(w => lower.includes(w))) return 'low'
  return 'medium'
}

export function classifyDomain(domain: string): SourceType {
  const d = domain.toLowerCase()
  if (['.gov','.mil','un.org','nato.int'].some(g => d.includes(g))) return 'official'
  if (['twitter.com','x.com','facebook.com','t.me','reddit.com'].some(g => d.includes(g))) return 'social'
  if (['bloomberg.com','ft.com','wsj.com','economist.com'].some(g => d.includes(g))) return 'economic'
  return 'independent'
}

export function extractActors(text: string): string[] {
  const known = [
    'USA','United States','Russia','China','India','Pakistan','Iran','Israel',
    'Saudi Arabia','Turkey','Ukraine','North Korea','South Korea','Japan',
    'UK','France','Germany','Italy','Spain','Poland','Australia','Canada',
    'Syria','Iraq','Yemen','Lebanon','Jordan','Egypt','Libya','Sudan',
    'Ethiopia','Somalia','Nigeria','Kenya','Congo','Mali','Niger','Burkina Faso',
    'Myanmar','Bangladesh','Afghanistan','Venezuela','Cuba','Brazil','Argentina',
    'Colombia','Mexico','Indonesia','Philippines','Thailand','Vietnam',
    'Taiwan','Qatar','UAE','NATO','UN','EU','African Union','ASEAN','BRICS','IMF',
    'Taliban','Hamas','Hezbollah','ISIS','Al-Qaeda','Wagner Group','Houthis','Azov','RSF',
    'Biden','Trump','Zelensky','Putin','Xi Jinping','Macron','Scholz','Netanyahu','Erdogan',
    'Modi','Imran Khan','Nawaz Sharif','PTI','BJP','Congress',
  ]
  return [...new Set(matchKnownActors(text, known))].slice(0, 8)
}

export function makeEvent(
  partial: Partial<NormalizedEvent> & { title: string; description: string; timestamp: string; source: NormalizedEvent['source'] }
): NormalizedEvent {
  const title = stripHtml(partial.title)
  const description = stripHtml(partial.description)
  const text = `${title} ${description}`
  return {
    id: uuidv4(),
    title,
    description,
    timestamp: partial.timestamp,
    location: partial.location ?? extractLocation(text),
    actors: partial.actors ?? extractActors(text),
    categories: partial.categories ?? inferCategories(text),
    severity: partial.severity ?? inferSeverity(text),
    source: partial.source,
    raw: partial.raw,
  }
}

/** Convert NormalizedEvent → ARGUS IntelEvent shape for map display */
export function toIntelEvent(e: NormalizedEvent, sourceId?: string): any {
  const sev = e.severity === 'info' ? 'low' : e.severity
  return {
    id: e.id,
    source: sourceId ?? e.source.name ?? 'user',
    category: (e.categories[0] ?? 'political') as any,
    title: e.title,
    summary: e.description,
    body: (e.raw?.body as string | undefined) || undefined,
    lat: e.location.lat ?? 0,
    lon: e.location.lng ?? 0,
    country: (e.location.country && e.location.country !== 'Unknown') ? e.location.country
           : (e.location.name && e.location.name !== 'Unknown') ? e.location.name : '',
    countryCode: (e.location.country && e.location.country !== 'Unknown') ? e.location.country : '',
    severity: sev,
    timestamp: e.timestamp,
    url: e.source.url ?? '',
    actors: e.actors?.length ? e.actors.map(name => ({ name, type: 'unknown' })) : undefined,
  }
}

function tokenize(text: string): Set<string> {
  return new Set((text.toLowerCase().match(/\b\w{3,}\b/g) ?? []))
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 1
  let intersection = 0
  for (const t of a) if (b.has(t)) intersection++
  return intersection / (a.size + b.size - intersection)
}

/** Remove events from `incoming` that are duplicates of anything in `existing`.
 *  Duplicate = same URL, same title (case-insensitive), or Jaccard title similarity >= 65%.
 *  Handles both NormalizedEvent (source.url) and IntelEvent (url) shapes. */
export function deduplicateEvents(incoming: NormalizedEvent[], existing: NormalizedEvent[]): NormalizedEvent[] {
  const getUrl = (e: any): string => e.source?.url || e.url || ''
  const existingUrls = new Set(existing.map(getUrl).filter(Boolean))
  const existingTitles = new Set(existing.map(e => e.title.toLowerCase()))
  const existingTokenSets = existing.map(e => tokenize(e.title))

  return incoming.filter(ev => {
    const url = ev.source.url || (ev as any).url || ''
    if (url && existingUrls.has(url)) return false
    if (existingTitles.has(ev.title.toLowerCase())) return false
    const tokens = tokenize(ev.title)
    if (existingTokenSets.some(et => jaccard(tokens, et) >= 0.65)) return false
    return true
  })
}
