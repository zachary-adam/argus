import type { IntelEvent } from '@/types'

/** How an event entered the workspace — for honest topic UI. */
export type TopicSourceBucket = 'aimed' | 'firehose' | 'yours'

export function topicSourceBucket(e: IntelEvent): TopicSourceBucket {
  if (
    e.tags?.includes('aimed-pull') ||
    e.tags?.includes('google-news') ||
    e.tags?.includes('web-search') ||
    (e.tags?.includes('targeted') && e.source === 'analyst')
  ) {
    return 'aimed'
  }
  if (e.tags?.includes('added') || e.tags?.includes('analyst-mark')) return 'yours'
  if (e.source === 'analyst') return 'yours'
  return 'firehose'
}

/** Short label for feed cards and chips. */
export function topicSourceShortLabel(bucket: TopicSourceBucket): string {
  switch (bucket) {
    case 'aimed': return 'Your beat'
    case 'yours': return 'Your clip'
    case 'firehose': return 'Global feed'
  }
}

/** Longer label for event detail / settings. */
export function topicSourceLabel(bucket: TopicSourceBucket): string {
  switch (bucket) {
    case 'aimed': return 'Matched your topic keywords'
    case 'yours': return 'Added by you (paste or scrape)'
    case 'firehose': return 'Global connectors (GDELT, ReliefWeb…)'
  }
}

const JUNK_PUBLISHER = /^(aimed|analyst)$/i

const CONNECTOR_PUBLISHER: Record<string, string> = {
  gdelt: 'GDELT', gdacs: 'GDACS', reliefweb: 'ReliefWeb', usgs: 'USGS',
  who: 'WHO', firms: 'NASA FIRMS', rss: 'News RSS', ucdp: 'UCDP',
  acled: 'ACLED', ocha: 'OCHA', unhcr: 'UNHCR', fewsnet: 'FEWS NET',
}

/** Real publisher name — never returns internal jargon like "Aimed". */
export function eventPublisherLabel(e: IntelEvent): string | null {
  const detail = e.source_detail?.trim()
  if (detail && !JUNK_PUBLISHER.test(detail)) return detail
  if (e.url) {
    try {
      const host = new URL(e.url).hostname.replace(/^www\./, '')
      if (host) return host
    } catch { /* invalid url */ }
  }
  if (e.source && e.source !== 'analyst') {
    return CONNECTOR_PUBLISHER[e.source] ?? e.source.toUpperCase()
  }
  return null
}

/** One-line provenance under event titles. */
export function eventProvenanceLine(e: IntelEvent): string {
  const pub = eventPublisherLabel(e)
  const arrival = topicSourceLabel(topicSourceBucket(e))
  return pub ? `${pub} · ${arrival}` : arrival
}

export interface GeoAnchor {
  lat: number
  lon: number
  country: string
  countryCode: string
}

function hashStr(s: string): number {
  let h = 0
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0 }
  return h
}

export function webResultToEvent(
  r: { title: string; url: string; snippet: string; domain: string },
  geo: GeoAnchor,
): IntelEvent {
  const title = r.title.slice(0, 160)
  return {
    id: `aimed-web-${Math.abs(hashStr(r.url))}`,
    source: 'analyst',
    category: 'political',
    title,
    summary: r.snippet ? r.snippet.slice(0, 280) : `${r.domain}: ${title}`,
    lat: geo.lat,
    lon: geo.lon,
    country: geo.country,
    countryCode: geo.countryCode,
    geoPrecision: 'city',
    severity: 'medium',
    timestamp: new Date().toISOString(),
    url: r.url,
    tags: ['targeted', 'aimed-pull', 'web-search'],
    source_detail: r.domain,
  } as IntelEvent
}

export function countByBucket(events: IntelEvent[]): Record<TopicSourceBucket, number> {
  const out: Record<TopicSourceBucket, number> = { aimed: 0, firehose: 0, yours: 0 }
  for (const e of events) out[topicSourceBucket(e)]++
  return out
}
