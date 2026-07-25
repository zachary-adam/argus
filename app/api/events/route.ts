import { NextRequest, NextResponse } from 'next/server'
import { IntelEvent } from '@/types'
import { getCache, setCache } from '@/lib/cache'
import { fetchGDELTEvents } from '@/lib/gdelt'
import { haversineDistance } from '@/lib/haversine'
import { vaultGet } from '@/lib/vault'
import { checkRateLimit, getClientIp } from '@/lib/rateLimit'
import { mapWithConcurrency } from '@/lib/concurrency'
import { geocodePlace, extractLocationQuery } from '@/lib/geocode'
import { deduplicateEvents } from '@/lib/dedupEvents'
import { FEATURES } from '@/lib/features'
import { DEMO_EVENTS, tagDemoEvents } from '@/lib/demoEvents'

async function fetchUSGSEarthquakes(): Promise<IntelEvent[]> {
  try {
    const res = await fetch('https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/2.5_day.geojson', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    return data.features.slice(0, 30).map((f: Record<string, unknown>) => {
      const p = f.properties as Record<string, unknown>
      const geo = f.geometry as { coordinates: number[] }
      const mag = p.mag as number
      return {
        id: `usgs-${f.id}`,
        source: 'usgs' as const,
        category: 'earthquake' as const,
        title: `M${mag.toFixed(1)} Earthquake — ${p.place}`,
        summary: `USGS reports ${mag.toFixed(1)} magnitude earthquake near ${p.place}.`,
        lat: geo.coordinates[1],
        lon: geo.coordinates[0],
        country: extractCountryFromPlace(String(p.place || '')),
        countryCode: 'XX',
        severity: mag >= 6 ? 'critical' : mag >= 5 ? 'high' : mag >= 4 ? 'medium' : 'low' as IntelEvent['severity'],
        timestamp: new Date(p.time as number).toISOString(),
        url: String(p.url || 'https://earthquake.usgs.gov'),
      }
    })
  } catch { return [] }
}

async function fetchGDACS(): Promise<IntelEvent[]> {
  try {
    const res = await fetch('https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?alertlevel=Green;Orange;Red&eventlist=EQ;TC;FL;VO;DR;WF', { signal: AbortSignal.timeout(8000) })
    if (!res.ok) return []
    const data = await res.json()
    const features = data.features || []
    return features.slice(0, 20).map((f: Record<string, unknown>, i: number) => {
      const p = f.properties as Record<string, unknown>
      const geo = f.geometry as { coordinates: number[] }
      const alertlevel = String(p.alertlevel || 'Green')
      return {
        id: `gdacs-${i}-${Date.now()}`,
        source: 'gdacs' as const,
        category: 'disaster' as const,
        title: String(p.name || p.eventtype || 'Disaster Event'),
        summary: String(p.description || `GDACS ${alertlevel} alert issued.`),
        lat: geo?.coordinates?.[1] || 0,
        lon: geo?.coordinates?.[0] || 0,
        country: String(p.country || 'Unknown'),
        countryCode: iso3ToAlpha2(String(p.iso3 || 'XX')),
        severity: alertlevel === 'Red' ? 'critical' : alertlevel === 'Orange' ? 'high' : 'medium' as IntelEvent['severity'],
        timestamp: new Date(String(p.fromdate || Date.now())).toISOString(),
        url: String(p.url || 'https://gdacs.org'),
      }
    })
  } catch { return [] }
}

async function fetchReliefWebRss(): Promise<IntelEvent[]> {
  try {
    const res = await fetch('https://reliefweb.int/updates/rss.xml', {
      signal: AbortSignal.timeout(10000),
      headers: { Accept: 'application/rss+xml, application/xml, text/xml, */*' },
    })
    if (!res.ok) return []
    const xml = await res.text()
    const items = xml.match(/<item>([\s\S]*?)<\/item>/g) || []

    const rssText = (item: string, tag: string): string => {
      const cdata = item.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]
      if (cdata != null) return cdata
      return item.match(new RegExp(`<${tag}>([^<]*)<\\/${tag}>`))?.[1] ?? ''
    }
    const rssBlock = (item: string, tag: string): string => {
      const cdata = item.match(new RegExp(`<${tag}><!\\[CDATA\\[([\\s\\S]*?)\\]\\]><\\/${tag}>`))?.[1]
      if (cdata != null) return cdata
      return item.match(new RegExp(`<${tag}>([\\s\\S]*?)<\\/${tag}>`))?.[1] ?? ''
    }

    const decodeHtml = (s: string): string =>
      s.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#039;/g, "'").replace(/&quot;/g, '"')

    const resolveCountry = (item: string, title: string, descRaw: string): string | undefined => {
      const desc = decodeHtml(descRaw)
      const candidates = [
        desc.match(/Country:\s*([^<\n]+)/i)?.[1]?.trim(),
        title.match(/^([^:]+):/)?.[1]?.trim(),
        rssText(item, 'category').trim(),
      ].filter(Boolean) as string[]
      for (const raw of candidates) {
        const name = normalizeCountryName(raw)
        const geo = inferGeoFromCountryName(name)
        if (geo.lat !== 0 || geo.lon !== 0) return name
      }
      return undefined
    }

    const events: IntelEvent[] = []
    for (const [i, item] of items.slice(0, 20).entries()) {
      try {
        const title = decodeHtml(rssText(item, 'title')).trim()
        if (!title) continue
        const link = rssText(item, 'link').trim() || 'https://reliefweb.int'
        const pubDate = rssText(item, 'pubDate') || new Date().toISOString()
        const descRaw = rssBlock(item, 'description')
        const desc = decodeHtml(descRaw)
        const countryName = resolveCountry(item, title, descRaw)
        const geo = countryName
          ? { ...inferGeoFromCountryName(countryName), country: countryName, countryCode: countryCodeFromName(countryName, ''), geoPrecision: 'country' as const }
          : inferGeoFromTitleWHO(title + ' ' + desc.replace(/<[^>]+>/g, ' '))
        if (geo.lat === 0 && geo.lon === 0) continue
        events.push({
          id: `reliefweb-rss-${i}-${title.slice(0, 40).replace(/\W/g, '')}`,
          source: 'reliefweb' as const,
          category: 'humanitarian' as const,
          title: title.slice(0, 140),
          summary: desc.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 280) || `ReliefWeb: ${title}`,
          lat: geo.lat,
          lon: geo.lon,
          country: geo.country,
          countryCode: geo.countryCode,
          geoPrecision: geo.geoPrecision,
          severity: 'medium' as const,
          timestamp: new Date(pubDate).toISOString(),
          url: link,
        })
      } catch { /* skip bad item */ }
    }
    return events
  } catch (err) {
    console.error('[events/reliefweb-rss]', err)
    return []
  }
}

async function fetchReliefWeb(): Promise<IntelEvent[]> {
  const appname = vaultGet('RELIEFWEB_APPNAME') ?? process.env.RELIEFWEB_APPNAME
  if (appname) {
    try {
      const res = await fetch(`https://api.reliefweb.int/v2/reports?appname=${encodeURIComponent(appname)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          limit: 25,
          sort: ['date.created:desc'],
          fields: { include: ['title', 'url', 'date.created', 'primary_country.name', 'primary_country.iso3', 'source.shortname'] },
          filter: { field: 'status', value: 'published' },
        }),
        signal: AbortSignal.timeout(10000),
      })
      if (res.ok) {
        const data = await res.json() as { data?: Array<{ fields?: Record<string, unknown> }> }
        const reports = data.data ?? []
        if (reports.length > 0) {
          return reports.map((item, i) => {
            const f = item.fields ?? {}
            const countryName = String((f.primary_country as { name?: string })?.name ?? 'Unknown')
            const geo = inferGeoFromCountryName(countryName)
            return {
              id: `reliefweb-${i}-${String(f.url ?? i).slice(-8)}`,
              source: 'reliefweb' as const,
              category: 'humanitarian' as const,
              title: String(f.title ?? 'Humanitarian Report'),
              summary: `ReliefWeb: ${f.title}. Source: ${(f.source as Array<{ shortname?: string }>)?.[0]?.shortname ?? 'UN OCHA'}.`,
              lat: geo.lat,
              lon: geo.lon,
              country: countryName,
              countryCode: countryCodeFromName(countryName, String((f.primary_country as { iso3?: string })?.iso3 ?? '')),
              severity: 'medium' as const,
              timestamp: String((f.date as { created?: string })?.created ?? new Date().toISOString()),
              url: String(f.url ?? 'https://reliefweb.int'),
            }
          }).filter((e: IntelEvent) => e.lat !== 0 || e.lon !== 0)
        }
      }
    } catch { /* fall through to RSS */ }
  }
  // Keyless fallback — ReliefWeb v2 API requires a registered appname; the public
  // RSS feed keeps humanitarian reporting live without vault setup.
  return fetchReliefWebRss()
}

// ── Wikipedia Current Events ─────────────────────────────────────────────────
// Scrapes Wikipedia's daily current events portal — human-curated, georeferenced
const WIKI_CATEGORY_MAP: Record<string, IntelEvent['category']> = {
  'armed conflicts': 'conflict', 'attacks': 'conflict', 'war': 'conflict',
  'disasters': 'disaster', 'accidents': 'disaster',
  'politics': 'political', 'elections': 'political', 'law': 'political',
  'economy': 'economic', 'business': 'economic',
  'health': 'health', 'science': 'environmental', 'environment': 'environmental',
}

function parseWikipediaEvents(wikitext: string, dateStr: string): IntelEvent[] {
  const events: IntelEvent[] = []
  let currentCategory: IntelEvent['category'] = 'political'

  const lines = wikitext.split('\n')
  for (const line of lines) {
    // Detect category headers like '''Armed conflicts and attacks'''
    const catMatch = line.match(/'''([^']+)'''/)
    if (catMatch) {
      const catLower = catMatch[1].toLowerCase()
      for (const [key, val] of Object.entries(WIKI_CATEGORY_MAP)) {
        if (catLower.includes(key)) { currentCategory = val; break }
      }
      continue
    }

    // Parse bullet points (* or **)
    const bulletMatch = line.match(/^\*+\s*(.+)$/)
    if (!bulletMatch) continue
    const raw = bulletMatch[1]

    // Extract plain text (remove wiki markup)
    const text = raw
      .replace(/\[\[([^\]|]+)\|([^\]]+)\]\]/g, '$2')
      .replace(/\[\[([^\]]+)\]\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\s+([^\]]+)\]/g, '$1')
      .replace(/\[https?:\/\/[^\s\]]+\]/g, '')
      .replace(/''+/g, '')
      .trim()

    if (text.length < 20) continue

    // Extract linked URLs
    const urlMatch = raw.match(/\[https?:\/\/(\S+)/)
    const url = urlMatch ? `https://${urlMatch[1].replace(/\].*/, '')}` : 'https://en.wikipedia.org/wiki/Portal:Current_events'

    // Extract country/location from wikilinks — first [[...]] is usually the country/conflict
    const locationLinks = [...raw.matchAll(/\[\[([^\]|]+?)(?:\|[^\]]+)?\]\]/g)].map(m => m[1])
    const geo = inferGeoFromText(locationLinks.join(' ') + ' ' + text)

    if (!geo) continue

    // Severity heuristic
    const lower = text.toLowerCase()
    const severity: IntelEvent['severity'] =
      lower.includes('kill') || lower.includes('dead') || lower.includes('airstrike') ||
      lower.includes('bomb') || lower.includes('attack') || lower.includes('war') ? 'high' :
      lower.includes('protest') || lower.includes('sanction') || lower.includes('crisis') ? 'medium' : 'low'

    events.push({
      id: `wiki-${dateStr}-${events.length}`,
      source: 'rss' as const,
      category: currentCategory,
      title: text.length > 120 ? text.slice(0, 117) + '…' : text,
      summary: text,
      lat: geo.lat,
      lon: geo.lon,
      country: geo.country,
      countryCode: geo.code,
      geoPrecision: geo.geoPrecision,
      severity,
      timestamp: new Date(dateStr.replace(/_/g, ' ')).toISOString(),
      url,
    })
  }
  return events
}

async function fetchWikipediaCurrentEvents(): Promise<IntelEvent[]> {
  try {
    const days = await Promise.all([0, 1, 2].map(async (d) => {
      const date = new Date(Date.now() - d * 86400000)
      const month = date.toLocaleString('en-US', { month: 'long' })
      const day = date.getDate()
      const year = date.getFullYear()
      const title = `Portal:Current_events/${year}_${month}_${day}`
      const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(title)}&prop=revisions&rvprop=content&format=json&rvslots=main`
      try {
        const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
        if (!res.ok) return []
        const data = await res.json()
        const pages = data.query?.pages || {}
        const page = Object.values(pages)[0] as Record<string, unknown>
        if (!page || page.missing) return []
        const revSlots = ((page.revisions as Array<Record<string, unknown>>)?.[0]?.slots as Record<string, Record<string, string>>)
        const content = revSlots?.main?.['*']
        if (!content) return []
        return parseWikipediaEvents(content, `${year}_${month}_${day}`)
      } catch { return [] }
    }))
    return days.flat()
  } catch { return [] }
}

function inferGeoFromText(text: string): { lat: number; lon: number; country: string; code: string; geoPrecision: 'country' } | null {
  const t = text.toLowerCase()
  for (const [key, geo] of Object.entries(GEO_MAP)) {
    if (t.includes(key)) {
      // Country centroid (no random jitter); flagged country-level.
      return { lat: geo.lat, lon: geo.lon, country: geo.country, code: geo.countryCode, geoPrecision: 'country' }
    }
  }
  return null
}

function normalizeCountryName(name: string): string {
  return name.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
}

function inferGeoFromCountryName(name: string): { lat: number; lon: number } {
  const key = normalizeCountryName(name).toLowerCase()
  const geo = GEO_MAP[key] || Object.values(GEO_MAP).find(g => g.country.toLowerCase() === key)
    || Object.entries(GEO_MAP).find(([k]) => key.includes(k) || k.includes(key))?.[1]
  if (geo) return { lat: geo.lat, lon: geo.lon }
  return { lat: 0, lon: 0 }
}

// ISO 3166-1 alpha-3 → alpha-2 lookup (common conflict/disaster nations)
const ISO3_TO_ISO2: Record<string, string> = {
  AFG:'AF',AGO:'AO',ALB:'AL',ARE:'AE',ARG:'AR',ARM:'AM',AUS:'AU',AUT:'AT',AZE:'AZ',
  BDI:'BI',BEN:'BJ',BFA:'BF',BGD:'BD',BGR:'BG',BHR:'BH',BIH:'BA',BLR:'BY',BLZ:'BZ',
  BOL:'BO',BRA:'BR',CAF:'CF',CAN:'CA',CHE:'CH',CHL:'CL',CHN:'CN',CIV:'CI',CMR:'CM',
  COD:'CD',COG:'CG',COL:'CO',CRI:'CR',CUB:'CU',CYP:'CY',CZE:'CZ',DEU:'DE',DJI:'DJ',
  DOM:'DO',DZA:'DZ',ECU:'EC',EGY:'EG',ERI:'ER',ESP:'ES',ETH:'ET',FIN:'FI',FRA:'FR',
  GAB:'GA',GBR:'GB',GEO:'GE',GHA:'GH',GIN:'GN',GMB:'GM',GNB:'GW',GRC:'GR',GTM:'GT',
  GUY:'GY',HND:'HN',HRV:'HR',HTI:'HT',HUN:'HU',IDN:'ID',IND:'IN',IRL:'IE',IRN:'IR',
  IRQ:'IQ',ISR:'IL',ITA:'IT',JAM:'JM',JOR:'JO',JPN:'JP',KAZ:'KZ',KEN:'KE',KGZ:'KG',
  KHM:'KH',KOR:'KR',KWT:'KW',LAO:'LA',LBN:'LB',LBR:'LR',LBY:'LY',LKA:'LK',LSO:'LS',
  MAR:'MA',MDA:'MD',MDG:'MG',MEX:'MX',MLI:'ML',MMR:'MM',MOZ:'MZ',MRT:'MR',MWI:'MW',
  MYS:'MY',NAM:'NA',NER:'NE',NGA:'NG',NIC:'NI',NLD:'NL',NOR:'NO',NPL:'NP',NZL:'NZ',
  OMN:'OM',PAK:'PK',PAN:'PA',PER:'PE',PHL:'PH',PNG:'PG',POL:'PL',PRK:'KP',PRT:'PT',
  PRY:'PY',PSE:'PS',QAT:'QA',ROU:'RO',RUS:'RU',RWA:'RW',SAU:'SA',SDN:'SD',SEN:'SN',
  SLE:'SL',SLV:'SV',SOM:'SO',SRB:'RS',SSD:'SS',SUR:'SR',SVK:'SK',SVN:'SI',SWE:'SE',
  SWZ:'SZ',SYR:'SY',TCD:'TD',TGO:'TG',THA:'TH',TJK:'TJ',TKM:'TM',TLS:'TL',TTO:'TT',
  TUN:'TN',TUR:'TR',TZA:'TZ',UGA:'UG',UKR:'UA',URY:'UY',USA:'US',UZB:'UZ',VEN:'VE',
  VNM:'VN',YEM:'YE',ZAF:'ZA',ZMB:'ZM',ZWE:'ZW',
}

function iso3ToAlpha2(iso3: string): string {
  if (!iso3 || iso3 === 'XX') return 'XX'
  const up = iso3.toUpperCase()
  if (ISO3_TO_ISO2[up]) return ISO3_TO_ISO2[up]
  // Fallback: match by country name in GEO_MAP
  return 'XX'
}

// Resolve country code from name (for ReliefWeb which has clean country names)
function countryCodeFromName(name: string, iso3: string): string {
  const byIso3 = iso3ToAlpha2(iso3)
  if (byIso3 !== 'XX') return byIso3
  const key = name.toLowerCase().trim()
  const geo = GEO_MAP[key] || Object.values(GEO_MAP).find(g => g.country.toLowerCase() === key)
  return geo?.countryCode ?? 'XX'
}


function extractCountryFromPlace(place: string): string {
  const parts = place.split(',')
  return parts[parts.length - 1]?.trim() || 'Unknown'
}

// ── WHO Disease Outbreaks ────────────────────────────────────────────────────
const WHO_FALLBACK: IntelEvent[] = [
  { id: 'who-fb-1', source: 'who', category: 'health', title: 'WHO Alert: Mpox Outbreak — Democratic Republic of Congo', summary: 'WHO Disease Outbreak Notice: Clade Ib mpox spreading in eastern DRC; cross-border cases reported.', lat: -1.5, lon: 29.0, country: 'DR Congo', countryCode: 'CD', severity: 'high', timestamp: new Date(Date.now() - 3600000).toISOString(), url: 'https://www.who.int/emergencies/disease-outbreak-news' },
  { id: 'who-fb-2', source: 'who', category: 'health', title: 'WHO Alert: Cholera — Yemen', summary: 'WHO Disease Outbreak Notice: Cholera cases surge in Hudaydah and Taiz governorates.', lat: 15.5, lon: 44.2, country: 'Yemen', countryCode: 'YE', severity: 'high', timestamp: new Date(Date.now() - 7200000).toISOString(), url: 'https://www.who.int/emergencies/disease-outbreak-news' },
  { id: 'who-fb-3', source: 'who', category: 'health', title: 'WHO Alert: Ebola Virus Disease — Uganda', summary: 'WHO Disease Outbreak Notice: Ebola Sudan strain cluster confirmed in central Uganda.', lat: 0.3, lon: 32.6, country: 'Uganda', countryCode: 'UG', severity: 'critical', timestamp: new Date(Date.now() - 10800000).toISOString(), url: 'https://www.who.int/emergencies/disease-outbreak-news' },
  { id: 'who-fb-4', source: 'who', category: 'health', title: 'WHO Alert: Dengue Fever — Bangladesh', summary: 'WHO Disease Outbreak Notice: Record dengue cases in Dhaka; health system under strain.', lat: 23.7, lon: 90.4, country: 'Bangladesh', countryCode: 'BD', severity: 'medium', timestamp: new Date(Date.now() - 14400000).toISOString(), url: 'https://www.who.int/emergencies/disease-outbreak-news' },
  { id: 'who-fb-5', source: 'who', category: 'health', title: 'WHO Alert: Polio — Afghanistan', summary: 'WHO Disease Outbreak Notice: WPV1 poliovirus detected in Kandahar; vaccination campaign launched.', lat: 31.6, lon: 65.7, country: 'Afghanistan', countryCode: 'AF', severity: 'high', timestamp: new Date(Date.now() - 18000000).toISOString(), url: 'https://www.who.int/emergencies/disease-outbreak-news' },
]

async function fetchWHO(): Promise<IntelEvent[]> {
  // Try JSON API first
  try {
    const res = await fetch('https://www.who.int/api/hubs/deafroutbreaks?$orderby=PublicationDate desc&$top=15', { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const data = await res.json()
      const items = (data.value || []) as Array<Record<string, string>>
      const events = items.slice(0, 15).map((item, i) => {
        const title = item.Title || item.Name || 'WHO Alert'
        const geo = inferGeoFromTitleWHO(title)
        return {
          id: `who-${i}-${Date.now()}`,
          source: 'who' as const,
          category: 'health' as const,
          title: title.slice(0, 120),
          summary: `WHO Disease Outbreak Notice: ${title}`,
          lat: geo.lat,
          lon: geo.lon,
          country: geo.country,
          countryCode: geo.countryCode,
          geoPrecision: geo.geoPrecision,
          severity: 'high' as const,
          timestamp: new Date(item.PublicationDate || Date.now()).toISOString(),
          url: item.Url || 'https://www.who.int/emergencies/disease-outbreak-news',
        }
      }).filter(e => e.lat !== 0 && e.lon !== 0)
      if (events.length > 0) return events
    }
  } catch { /* fall through to RSS */ }

  // Try RSS feed
  try {
    const res = await fetch('https://www.who.int/feeds/entity/don/en/rss.xml', { signal: AbortSignal.timeout(8000) })
    if (res.ok) {
      const text = await res.text()
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || []
      const events = items.slice(0, 15).map((item, i) => {
        const title = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || 'WHO Alert'
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || 'https://who.int'
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || new Date().toISOString()
        const geo = inferGeoFromTitleWHO(title)
        return {
          id: `who-${i}-${Date.now()}`,
          source: 'who' as const,
          category: 'health' as const,
          title: title.slice(0, 120),
          summary: `WHO Disease Outbreak Notice: ${title}`,
          lat: geo.lat,
          lon: geo.lon,
          country: geo.country,
          countryCode: geo.countryCode,
          geoPrecision: geo.geoPrecision,
          severity: 'high' as const,
          timestamp: new Date(pubDate).toISOString(),
          url: link,
        }
      }).filter(e => e.lat !== 0 && e.lon !== 0)
      if (events.length > 0) return events
    }
  } catch { /* fall through to hardcoded */ }

  return WHO_FALLBACK
}

// ── NASA FIRMS Wildfires ─────────────────────────────────────────────────────
async function fetchNASAFIRMS(): Promise<IntelEvent[]> {
  const key = vaultGet('NASA_FIRMS_KEY') ?? process.env.NASA_FIRMS_KEY
  if (!key) return []
  try {
    const url = `https://firms.modaps.eosdis.nasa.gov/api/area/csv/${key}/VIIRS_SNPP_NRT/world/1`
    const res = await fetch(url, { signal: AbortSignal.timeout(15000) })
    if (!res.ok) return []
    const text = await res.text()
    const lines = text.split('\n').slice(1).filter(Boolean)

    // Parse CSV rows
    const fires: { lat: number; lon: number; brightness: number; confidence: number; date: string }[] = []
    for (const line of lines) {
      const parts = line.split(',')
      const lat = parseFloat(parts[0])
      const lon = parseFloat(parts[1])
      const brightness = parseFloat(parts[2])
      const confidence = parseInt(parts[8] || '0', 10)
      const date = parts[5] || new Date().toISOString().slice(0, 10)
      if (isNaN(lat) || isNaN(lon) || confidence < 80) continue
      fires.push({ lat, lon, brightness, confidence, date })
    }

    // Cluster fires within 50km
    const clusters: typeof fires[] = []
    const used = new Set<number>()
    for (let i = 0; i < fires.length; i++) {
      if (used.has(i)) continue
      const cluster = [fires[i]]
      used.add(i)
      for (let j = i + 1; j < fires.length; j++) {
        if (used.has(j)) continue
        if (haversineDistance(fires[i].lat, fires[i].lon, fires[j].lat, fires[j].lon) < 50) {
          cluster.push(fires[j])
          used.add(j)
        }
      }
      clusters.push(cluster)
    }

    return clusters.slice(0, 20).map((cluster, i) => {
      const center = cluster[0]
      const maxBright = Math.max(...cluster.map(f => f.brightness))
      const geo = inferGeoFromTitleWHO(`fire at ${center.lat},${center.lon}`)
      const sev: IntelEvent['severity'] = maxBright > 400 ? 'critical' : maxBright > 350 ? 'high' : 'medium'
      return {
        id: `firms-${i}-${Date.now()}`,
        source: 'firms' as const,
        category: 'wildfire' as const,
        title: `Wildfire Cluster — ${cluster.length} hotspots (${center.lat.toFixed(1)}°, ${center.lon.toFixed(1)}°)`,
        summary: `NASA VIIRS detects ${cluster.length} active fire hotspots. Max brightness: ${maxBright.toFixed(0)}K. Confidence: high.`,
        lat: center.lat,
        lon: center.lon,
        country: geo.country,
        countryCode: geo.countryCode,
        severity: sev,
        timestamp: new Date(center.date).toISOString(),
        url: 'https://firms.modaps.eosdis.nasa.gov',
      }
    })
  } catch { return [] }
}

// ── RSS News Aggregator ──────────────────────────────────────────────────────
const RSS_FEEDS = [
  'https://www.aljazeera.com/xml/rss/all.xml',
  'https://feeds.bbci.co.uk/news/world/rss.xml',
  'https://rss.nytimes.com/services/xml/rss/nyt/World.xml',
  'https://www.france24.com/en/rss',
  'https://www.crisisgroup.org/feed',
  'https://feeds.theguardian.com/theguardian/world/rss',
  'https://foreignpolicy.com/feed/',
]

const CRISIS_KEYWORDS = /kill|dead|attack|bomb|missile|war|strike|clash|military|troops|rebel|coup|protest|tension|sanction|crisis|explosion|hostage|terror|invasion|ceasefire|drone|nuclear|siege/i

async function fetchRSSFeeds(): Promise<IntelEvent[]> {
  try {
    const results = await Promise.allSettled(
      RSS_FEEDS.map(feed =>
        fetch(feed, { signal: AbortSignal.timeout(6000), headers: { 'User-Agent': 'ARGUS/1.0' } })
          .then(r => r.ok ? r.text() : Promise.reject())
      )
    )

    // Build candidate list with centroid fallback first
    type Candidate = { feedIdx: number; i: number; title: string; link: string; pubDate: string; centroid: ReturnType<typeof inferGeoFromTitleWHO> }
    const candidates: Candidate[] = []
    results.forEach((result, feedIdx) => {
      if (result.status !== 'fulfilled') return
      const text = result.value
      const items = text.match(/<item>([\s\S]*?)<\/item>/g) || []
      items.slice(0, 10).forEach((item, i) => {
        const rawTitle = item.match(/<title><!\[CDATA\[(.*?)\]\]><\/title>/)?.[1] || item.match(/<title>(.*?)<\/title>/)?.[1] || ''
        const title = rawTitle.replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#039;/g, "'").replace(/&#\d+;/g, '')
        if (!title || !CRISIS_KEYWORDS.test(title)) return
        const centroid = inferGeoFromTitleWHO(title)
        if (centroid.lat === 0 && centroid.lon === 0) return
        const link = item.match(/<link>(.*?)<\/link>/)?.[1] || ''
        const pubDate = item.match(/<pubDate>(.*?)<\/pubDate>/)?.[1] || new Date().toISOString()
        candidates.push({ feedIdx, i, title, link, pubDate, centroid })
      })
    })

    // Geocode each candidate — replace centroid with precise coords when possible.
    // Capped concurrency so a large feed pull doesn't burst-ban the geocoder or
    // stall the awaited cold-start fetch behind hundreds of simultaneous requests.
    const events = await mapWithConcurrency(candidates, 5, async ({ feedIdx, i, title, link, pubDate, centroid }) => {
      const query = extractLocationQuery(title, centroid.country !== 'Unknown' ? centroid.country : undefined)
      const precise = query ? await geocodePlace(query) : null
      const geo = precise ?? centroid
      return {
        id: `rss-${feedIdx}-${i}-${Date.now()}`,
        source: 'rss' as const,
        category: inferCategoryRSS(title),
        title: title.slice(0, 120),
        summary: `News intelligence: ${title}`,
        lat: geo.lat,
        lon: geo.lon,
        country: geo.country,
        countryCode: geo.countryCode,
        // Precise geocode ⇒ city-level; otherwise the country centroid.
        geoPrecision: precise ? ('city' as const) : centroid.geoPrecision,
        severity: inferSeverityRSS(title),
        timestamp: new Date(pubDate).toISOString(),
        url: link,
      } satisfies IntelEvent
    })

    return events
  } catch { return [] }
}

// ── ACLED (conditional) — OAuth2 via shared connector ────────────────────────
async function fetchACLED(): Promise<IntelEvent[]> {
  try {
    const { fetchACLEDConnector } = await import('@/lib/connectors/acled')
    const { toIntelEvent } = await import('@/lib/normalize')
    const rows = await fetchACLEDConnector([])
    return rows.map(ne => toIntelEvent(ne, 'acled') as IntelEvent).filter(e => e.lat !== 0 || e.lon !== 0)
  } catch { return [] }
}

// ── Shared geo inference (reuses COUNTRY_GEO logic from gdelt.ts) ────────────
const GEO_MAP: Record<string, { country: string; countryCode: string; lat: number; lon: number }> = {
  ukraine: { country: 'Ukraine', countryCode: 'UA', lat: 48.5, lon: 31.0 },
  russia: { country: 'Russia', countryCode: 'RU', lat: 60.0, lon: 90.0 },
  israel: { country: 'Israel', countryCode: 'IL', lat: 31.5, lon: 34.9 },
  gaza: { country: 'Palestine', countryCode: 'PS', lat: 31.4, lon: 34.3 },
  palestine: { country: 'Palestine', countryCode: 'PS', lat: 31.9, lon: 35.2 },
  iran: { country: 'Iran', countryCode: 'IR', lat: 32.4, lon: 53.7 },
  china: { country: 'China', countryCode: 'CN', lat: 35.0, lon: 105.0 },
  taiwan: { country: 'Taiwan', countryCode: 'TW', lat: 23.7, lon: 121.0 },
  myanmar: { country: 'Myanmar', countryCode: 'MM', lat: 17.0, lon: 96.0 },
  sudan: { country: 'Sudan', countryCode: 'SD', lat: 15.5, lon: 32.5 },
  ethiopia: { country: 'Ethiopia', countryCode: 'ET', lat: 9.1, lon: 40.5 },
  somalia: { country: 'Somalia', countryCode: 'SO', lat: 5.0, lon: 45.0 },
  yemen: { country: 'Yemen', countryCode: 'YE', lat: 15.5, lon: 48.5 },
  syria: { country: 'Syria', countryCode: 'SY', lat: 35.0, lon: 38.0 },
  iraq: { country: 'Iraq', countryCode: 'IQ', lat: 33.2, lon: 43.7 },
  lebanon: { country: 'Lebanon', countryCode: 'LB', lat: 33.9, lon: 35.9 },
  pakistan: { country: 'Pakistan', countryCode: 'PK', lat: 30.0, lon: 70.0 },
  afghanistan: { country: 'Afghanistan', countryCode: 'AF', lat: 33.9, lon: 67.7 },
  nigeria: { country: 'Nigeria', countryCode: 'NG', lat: 9.1, lon: 8.7 },
  mali: { country: 'Mali', countryCode: 'ML', lat: 17.6, lon: -4.0 },
  venezuela: { country: 'Venezuela', countryCode: 'VE', lat: 6.4, lon: -66.6 },
  colombia: { country: 'Colombia', countryCode: 'CO', lat: 4.6, lon: -74.1 },
  mexico: { country: 'Mexico', countryCode: 'MX', lat: 23.6, lon: -102.6 },
  'north korea': { country: 'North Korea', countryCode: 'KP', lat: 40.3, lon: 127.5 },
  india: { country: 'India', countryCode: 'IN', lat: 20.6, lon: 78.9 },
  turkey: { country: 'Turkey', countryCode: 'TR', lat: 38.9, lon: 35.2 },
  egypt: { country: 'Egypt', countryCode: 'EG', lat: 26.8, lon: 30.8 },
  libya: { country: 'Libya', countryCode: 'LY', lat: 26.3, lon: 17.2 },
  congo: { country: 'DR Congo', countryCode: 'CD', lat: -4.0, lon: 21.8 },
  haiti: { country: 'Haiti', countryCode: 'HT', lat: 18.9, lon: -72.3 },
  'saudi arabia': { country: 'Saudi Arabia', countryCode: 'SA', lat: 24.7, lon: 46.7 },
  'south sudan': { country: 'South Sudan', countryCode: 'SS', lat: 6.9, lon: 31.3 },
  chad: { country: 'Chad', countryCode: 'TD', lat: 15.5, lon: 18.7 },
  kenya: { country: 'Kenya', countryCode: 'KE', lat: -1.3, lon: 36.8 },
  bangladesh: { country: 'Bangladesh', countryCode: 'BD', lat: 23.7, lon: 90.4 },
  philippines: { country: 'Philippines', countryCode: 'PH', lat: 12.9, lon: 121.8 },
  indonesia: { country: 'Indonesia', countryCode: 'ID', lat: -0.8, lon: 113.9 },
  // Additional coverage
  'burkina faso': { country: 'Burkina Faso', countryCode: 'BF', lat: 12.4, lon: -1.6 },
  mozambique: { country: 'Mozambique', countryCode: 'MZ', lat: -18.7, lon: 35.5 },
  niger: { country: 'Niger', countryCode: 'NE', lat: 17.6, lon: 8.1 },
  cameroon: { country: 'Cameroon', countryCode: 'CM', lat: 7.4, lon: 12.4 },
  tanzania: { country: 'Tanzania', countryCode: 'TZ', lat: -6.4, lon: 34.9 },
  senegal: { country: 'Senegal', countryCode: 'SN', lat: 14.5, lon: -14.5 },
  ghana: { country: 'Ghana', countryCode: 'GH', lat: 7.9, lon: -1.0 },
  zimbabwe: { country: 'Zimbabwe', countryCode: 'ZW', lat: -20.0, lon: 30.0 },
  zambia: { country: 'Zambia', countryCode: 'ZM', lat: -13.1, lon: 27.8 },
  'south africa': { country: 'South Africa', countryCode: 'ZA', lat: -29.0, lon: 25.1 },
  'central african republic': { country: 'Central African Republic', countryCode: 'CF', lat: 6.6, lon: 20.9 },
  'ivory coast': { country: "Côte d'Ivoire", countryCode: 'CI', lat: 7.5, lon: -5.5 },
  "côte d'ivoire": { country: "Côte d'Ivoire", countryCode: 'CI', lat: 7.5, lon: -5.5 },
  guinea: { country: 'Guinea', countryCode: 'GN', lat: 11.0, lon: -10.9 },
  'dr congo': { country: 'DR Congo', countryCode: 'CD', lat: -4.0, lon: 21.8 },
  'democratic republic': { country: 'DR Congo', countryCode: 'CD', lat: -4.0, lon: 21.8 },
  'south korea': { country: 'South Korea', countryCode: 'KR', lat: 36.5, lon: 127.8 },
  brazil: { country: 'Brazil', countryCode: 'BR', lat: -14.2, lon: -51.9 },
  argentina: { country: 'Argentina', countryCode: 'AR', lat: -38.4, lon: -63.6 },
  peru: { country: 'Peru', countryCode: 'PE', lat: -9.2, lon: -75.0 },
  'sri lanka': { country: 'Sri Lanka', countryCode: 'LK', lat: 7.9, lon: 80.8 },
  nepal: { country: 'Nepal', countryCode: 'NP', lat: 28.4, lon: 84.1 },
  georgia: { country: 'Georgia', countryCode: 'GE', lat: 42.3, lon: 43.4 },
  azerbaijan: { country: 'Azerbaijan', countryCode: 'AZ', lat: 40.1, lon: 47.6 },
  armenia: { country: 'Armenia', countryCode: 'AM', lat: 40.1, lon: 45.0 },
  kazakhstan: { country: 'Kazakhstan', countryCode: 'KZ', lat: 48.0, lon: 66.9 },
}

function inferGeoFromTitleWHO(title: string): { country: string; countryCode: string; lat: number; lon: number; geoPrecision?: 'country' } {
  const t = title.toLowerCase()
  for (const [key, geo] of Object.entries(GEO_MAP)) {
    if (t.includes(key)) {
      // Country centroid (no random jitter); flagged country-level.
      return { ...geo, geoPrecision: 'country' }
    }
  }
  return { country: 'Unknown', countryCode: 'XX', lat: 0, lon: 0 }
}

function inferSeverityRSS(title: string): IntelEvent['severity'] {
  const t = title.toLowerCase()
  if (/kill|dead|bomb|attack|missile|explosion|massacre|invasion|nuclear/.test(t)) return 'critical'
  if (/conflict|clash|military|troops|rebel|coup|hostage|terror|siege/.test(t)) return 'high'
  if (/protest|tension|sanction|crisis|ceasefire|drone/.test(t)) return 'medium'
  return 'low'
}

function inferCategoryRSS(title: string): IntelEvent['category'] {
  const t = title.toLowerCase()
  if (/disease|outbreak|virus|epidemic|health/.test(t)) return 'health'
  if (/refugee|humanitarian|famine|food/.test(t)) return 'humanitarian'
  if (/election|government|president|coup|protest/.test(t)) return 'political'
  if (/economy|sanction|trade|oil|currency/.test(t)) return 'economic'
  return 'conflict'
}

// In-flight promise — coalesces concurrent cold-start requests into one fetch
let inFlightFetch: Promise<IntelEvent[]> | null = null

async function fetchAllSources(): Promise<IntelEvent[]> {
  const fetchedAt = new Date().toISOString()
  const hasKey = (k: string) => !!(vaultGet(k) ?? process.env[k])

  // Hazard feeds (earthquakes, disasters, disease, fires) are noise for a political
  // tool — gated off by default so they don't pollute the feed or slow the pull.
  const NONE = Promise.resolve([] as IntelEvent[])
  const [gdeltEvents, usgsEvents, gdacsEvents, reliefwebEvents, wikiEvents,
         whoEvents, firmsEvents, rssEvents, acledEvents] = await Promise.all([
    fetchGDELTEvents(),
    FEATURES.hazardFeeds ? fetchUSGSEarthquakes() : NONE,
    FEATURES.hazardFeeds ? fetchGDACS() : NONE,
    fetchReliefWeb(),
    fetchWikipediaCurrentEvents(),
    FEATURES.hazardFeeds ? fetchWHO() : NONE,
    FEATURES.hazardFeeds ? fetchNASAFIRMS() : NONE,
    fetchRSSFeeds(),
    fetchACLED(),
  ])

  setCache('source-status', {
    fetchedAt,
    sources: [
      { id: 'gdelt',      label: 'GDELT',       count: gdeltEvents.length,      ok: gdeltEvents.length > 0,      keyRequired: false },
      { id: 'reliefweb',  label: 'ReliefWeb',    count: reliefwebEvents.length,  ok: reliefwebEvents.length > 0,  keyRequired: false, hasKey: !!(vaultGet('RELIEFWEB_APPNAME') ?? process.env.RELIEFWEB_APPNAME) },
      { id: 'wikipedia',  label: 'Wikipedia',    count: wikiEvents.length,       ok: wikiEvents.length > 0,       keyRequired: false },
      { id: 'rss',        label: 'RSS Feeds',    count: rssEvents.length,        ok: rssEvents.length > 0,        keyRequired: false },
      { id: 'acled',      label: 'ACLED',        count: acledEvents.length,      ok: acledEvents.length > 0,      keyRequired: true,  hasKey: hasKey('ACLED_EMAIL') && hasKey('ACLED_PASSWORD') },
      // Hazard feeds only reported when enabled, so they don't read as "failed sources".
      ...(FEATURES.hazardFeeds ? [
        { id: 'usgs',       label: 'USGS',         count: usgsEvents.length,       ok: usgsEvents.length > 0,       keyRequired: false },
        { id: 'gdacs',      label: 'GDACS',        count: gdacsEvents.length,      ok: gdacsEvents.length > 0,       keyRequired: false },
        { id: 'who',        label: 'WHO',          count: whoEvents.length,        ok: whoEvents.length > 0,         keyRequired: false },
        { id: 'firms',      label: 'NASA FIRMS',   count: firmsEvents.length,      ok: firmsEvents.length > 0,       keyRequired: true,  hasKey: hasKey('NASA_FIRMS_KEY') },
      ] : []),
    ],
  }, 360)

  const liveEvents = [...gdeltEvents, ...usgsEvents, ...gdacsEvents,
                      ...reliefwebEvents, ...wikiEvents, ...whoEvents, ...firmsEvents,
                      ...rssEvents, ...acledEvents]

  const fallbackEvents = liveEvents.length === 0 && FEATURES.demoFallback
    ? tagDemoEvents(DEMO_EVENTS)
    : []

  let all = [...liveEvents, ...fallbackEvents]
  all = deduplicateEvents(all)
  all.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime())
  all = all.slice(0, 120)  // cap at 120 most-recent — keeps payload tight

  // Fresh TTL 5 min; stale TTL 30 min (separate key for SWR)
  setCache('all-events', all, 300)
  setCache('all-events-stale', all, 1800)

  // Persist snapshot for trend analysis (fire-and-forget)
  import('@/lib/eventHistory').then(({ appendHistory }) => appendHistory(all)).catch(() => {})

  return all
}

export async function GET(req: NextRequest) {
  if (!checkRateLimit(`events:${getClientIp(req)}`, 20, 60_000)) {
    return NextResponse.json({ error: 'Rate limited — try again shortly' }, { status: 429 })
  }

  const CC = { 'Cache-Control': 'max-age=60, stale-while-revalidate=300' }

  // Stale-while-revalidate: serve cached data immediately, refresh in background
  const fresh = getCache<IntelEvent[]>('all-events')
  if (fresh) return NextResponse.json(fresh, { headers: CC })

  const stale = getCache<IntelEvent[]>('all-events-stale')
  if (stale) {
    // Return stale data immediately; kick off background refresh (coalesced)
    if (!inFlightFetch) {
      inFlightFetch = fetchAllSources().finally(() => { inFlightFetch = null })
    }
    return NextResponse.json(stale, { headers: CC })
  }

  // Cold cache — coalesce concurrent requests into one fetch
  if (!inFlightFetch) {
    inFlightFetch = fetchAllSources().finally(() => { inFlightFetch = null })
  }
  const all = await inFlightFetch
  return NextResponse.json(all, { headers: CC })
}
