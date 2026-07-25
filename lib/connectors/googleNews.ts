/**
 * Query-driven ingestion via Google News RSS search.
 *
 * The global feed (GDELT firehose, fixed RSS list) can never surface a single
 * town's election — it was never collecting it. This *aims*: it turns a project's
 * place + keywords + watch-entities into a search query and pulls matching news,
 * placed at the geocoded focus location. This is what makes hyper-local analysis
 * possible alongside the broad global view.
 *
 * Keyless: news.google.com/rss/search?q=…  (returns an RSS feed of matches).
 */
import { IntelEvent } from '@/types'
import { Targeting } from '@/types/project'
import { stripHtml, inferCategories, inferSeverity } from '@/lib/normalize'
import { placeMatchTokens } from '@/lib/relevance'

/**
 * Place clause for Google News — multi-word places expand to
 * ("Jamia Nagar" OR Jamia) so neighbourhood suffixes don't starve recall.
 */
export function placeQueryClause(placeName: string | undefined): string {
  const city = placeName?.split(',')[0]?.trim()
  if (!city) return ''
  const tokens = placeMatchTokens(city)
  if (tokens.length <= 1) return `"${city}"`
  return `(${tokens.map(t => (/\s/.test(t) ? `"${t}"` : t)).join(' OR ')})`
}

/**
 * Build the Google News search query from the project's targeting. Pure.
 *
 * HIGH-RECALL by design: the place is AND-ed with a single OR-group of all
 * entities + keywords, so an article matching ANY one topic term near the place
 * qualifies. Precision is handled downstream by the relevance brain.
 */
export function buildNewsQuery(t: Pick<Targeting, 'placeName' | 'keywords' | 'watchEntities'>): string {
  const placeClause = placeQueryClause(t.placeName)
  const terms = [...(t.watchEntities ?? []), ...(t.keywords ?? [])]
    .map(s => s.trim()).filter(Boolean)
  const topicGroup = terms.length
    ? `(${terms.map(term => (/\s/.test(term) ? `"${term}"` : term)).join(' OR ')})`
    : ''
  if (placeClause && topicGroup) return `${placeClause} ${topicGroup}`
  if (placeClause) return placeClause
  return topicGroup
}

export function googleNewsUrl(query: string, windowDays = 7, locale = { hl: 'en-US', gl: 'US', ceid: 'US:en' }): string {
  const q = `${query} when:${windowDays}d`
  return `https://news.google.com/rss/search?q=${encodeURIComponent(q)}&hl=${locale.hl}&gl=${locale.gl}&ceid=${locale.ceid}`
}

interface GeoAnchor { lat: number; lon: number; country: string; countryCode: string }

/**
 * Parse a Google News RSS document into IntelEvents anchored at `geo`. Pure — the
 * network fetch is separate so this can be unit-tested. Items are tagged 'targeted'
 * so they bypass region filtering (they were explicitly requested for this project).
 */
export function parseGoogleNews(xml: string, geo: GeoAnchor, max = 30): IntelEvent[] {
  const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []
  const out: IntelEvent[] = []
  for (let i = 0; i < items.length && out.length < max; i++) {
    const item = items[i]
    const rawTitle = item.match(/<title>(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/title>/)?.[1] || ''
    const title = stripHtml(rawTitle).replace(/&amp;/g, '&').replace(/&#39;/g, "'").replace(/&quot;/g, '"').trim()
    if (!title) continue
    const link = item.match(/<link>([\s\S]*?)<\/link>/)?.[1]?.trim() || ''
    const pub = item.match(/<pubDate>([\s\S]*?)<\/pubDate>/)?.[1]?.trim()
    const source = item.match(/<source[^>]*>([\s\S]*?)<\/source>/)?.[1]?.trim() || 'Google News'
    const ts = pub ? new Date(pub) : new Date()
    out.push({
      id: `targeted-${Math.abs(hashStr(title + link))}`,
      source: 'analyst',
      category: (inferCategories(title)[0] ?? 'political') as IntelEvent['category'],
      title: title.slice(0, 160),
      summary: `${source}: ${title}`,
      lat: geo.lat,
      lon: geo.lon,
      country: geo.country,
      countryCode: geo.countryCode,
      geoPrecision: 'city',
      severity: inferSeverity(title) as IntelEvent['severity'],
      timestamp: isNaN(ts.getTime()) ? new Date().toISOString() : ts.toISOString(),
      url: link,
      tags: ['targeted', 'aimed-pull', 'google-news'],
      source_detail: source,
    } as IntelEvent)
  }
  return out
}

// Stable id hash so the same article dedups across refetches (no Date.now in id).
function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return h
}
