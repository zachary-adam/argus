import { IntelEvent } from '@/types'
import { getCache, setCache } from './cache'
import { geocodePlace, extractLocationQuery } from './geocode'

const GDELT_FALLBACK: IntelEvent[] = [
  { id: 'gdelt-fb-1', source: 'gdelt', category: 'conflict', title: 'Artillery exchanges reported along eastern Ukraine frontline', summary: 'Heavy artillery fire exchanged in Zaporizhzhia oblast; civilian infrastructure targeted.', lat: 47.8, lon: 35.2, country: 'Ukraine', countryCode: 'UA', severity: 'critical', timestamp: new Date(Date.now() - 2 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 12 },
  { id: 'gdelt-fb-2', source: 'gdelt', category: 'conflict', title: 'Israeli airstrikes target Gaza infrastructure', summary: 'IDF airstrikes on northern Gaza; hospitals report mass casualties.', lat: 31.5, lon: 34.47, country: 'Israel', countryCode: 'IL', severity: 'critical', timestamp: new Date(Date.now() - 4 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 34 },
  { id: 'gdelt-fb-3', source: 'gdelt', category: 'conflict', title: 'Houthi missile launch toward Red Sea shipping lane', summary: 'Yemen-based Houthi forces launch anti-ship missile targeting merchant vessel near Bab-el-Mandeb.', lat: 13.1, lon: 43.0, country: 'Yemen', countryCode: 'YE', severity: 'critical', timestamp: new Date(Date.now() - 6 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-4', source: 'gdelt', category: 'political', title: 'Iran IRGC conducts ballistic missile test', summary: 'Islamic Revolutionary Guard Corps tests medium-range ballistic missile in Persian Gulf exercises.', lat: 25.3, lon: 57.8, country: 'Iran', countryCode: 'IR', severity: 'high', timestamp: new Date(Date.now() - 8 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-5', source: 'gdelt', category: 'conflict', title: 'Myanmar junta offensive intensifies in Sagaing region', summary: 'Military government forces advance against resistance fighters in northwestern Myanmar.', lat: 21.9, lon: 95.5, country: 'Myanmar', countryCode: 'MM', severity: 'high', timestamp: new Date(Date.now() - 10 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 8 },
  { id: 'gdelt-fb-6', source: 'gdelt', category: 'political', title: 'Russia-Ukraine peace talks collapse in Geneva', summary: 'Diplomatic negotiations collapse after Russia demands territorial concessions.', lat: 46.2, lon: 6.1, country: 'Switzerland', countryCode: 'CH', severity: 'high', timestamp: new Date(Date.now() - 12 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-7', source: 'gdelt', category: 'conflict', title: 'Sudan RSF advances on Khartoum suburb', summary: 'Rapid Support Forces make territorial gains in Omdurman as SAF air campaign intensifies.', lat: 15.5, lon: 32.5, country: 'Sudan', countryCode: 'SD', severity: 'critical', timestamp: new Date(Date.now() - 14 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 45 },
  { id: 'gdelt-fb-8', source: 'gdelt', category: 'conflict', title: 'Ethiopia Amhara region fighting resumes', summary: 'Clashes between FANO militia and federal forces in Amhara region; mass displacement reported.', lat: 11.7, lon: 37.9, country: 'Ethiopia', countryCode: 'ET', severity: 'high', timestamp: new Date(Date.now() - 16 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-9', source: 'gdelt', category: 'political', title: 'Taiwan PLA drills simulate blockade scenarios', summary: 'Chinese military exercises around Taiwan include simulated naval blockade and amphibious landing drills.', lat: 23.5, lon: 121.0, country: 'Taiwan', countryCode: 'TW', severity: 'high', timestamp: new Date(Date.now() - 18 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-10', source: 'gdelt', category: 'conflict', title: 'Somalia Al-Shabaab attacks Mogadishu checkpoint', summary: 'Vehicle-borne IED detonation at federal government checkpoint kills security personnel.', lat: 2.0, lon: 45.3, country: 'Somalia', countryCode: 'SO', severity: 'critical', timestamp: new Date(Date.now() - 20 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 7 },
  { id: 'gdelt-fb-11', source: 'gdelt', category: 'political', title: 'Venezuela opposition arrested ahead of elections', summary: 'Maduro government detains opposition leaders; international community condemns crackdown.', lat: 10.5, lon: -66.9, country: 'Venezuela', countryCode: 'VE', severity: 'medium', timestamp: new Date(Date.now() - 22 * 3600000).toISOString(), url: 'https://www.gdeltproject.org' },
  { id: 'gdelt-fb-12', source: 'gdelt', category: 'conflict', title: 'Pakistan-Afghanistan border clash kills soldiers', summary: 'Cross-border fire between Pakistani Army and Afghan border guards in Khyber region.', lat: 34.0, lon: 71.5, country: 'Pakistan', countryCode: 'PK', severity: 'high', timestamp: new Date(Date.now() - 24 * 3600000).toISOString(), url: 'https://www.gdeltproject.org', fatalities: 3 },
]

export async function fetchGDELTEvents(): Promise<IntelEvent[]> {
  const cached = getCache<IntelEvent[]>('gdelt-events')
  if (cached) return cached

  try {
    const urls = [
      'https://api.gdeltproject.org/api/v2/doc/doc?query=conflict%20OR%20crisis%20OR%20attack%20OR%20war%20OR%20missile&mode=artlist&maxrecords=50&format=json&timespan=48h',
      'https://api.gdeltproject.org/api/v2/gkg/doc?query=conflict%20OR%20crisis%20OR%20attack%20OR%20war&mode=artlist&maxrecords=50&format=json&timespan=48h',
    ]

    for (const url of urls) {
      const res = await fetch(url, { signal: AbortSignal.timeout(8000) })
      if (!res.ok) continue
      const data = await res.json()
      const articles = data.articles || []

      const events: IntelEvent[] = articles
        .filter((a: Record<string, string>) => a.url && a.title)
        .slice(0, 30)
        .map((a: Record<string, string>, i: number) => {
          const title = a.title || ''
          const url = a.url || ''
          const domain = new URL(url).hostname
          const severity = inferSeverity(title)
          const { country, countryCode, lat, lon, geoPrecision } = inferGeoFromTitle(title, domain)

          return {
            id: `gdelt-${Date.now()}-${i}`,
            source: 'gdelt' as const,
            category: inferCategory(title),
            title: title.slice(0, 120),
            summary: a.seendate ? `Reported ${a.seendate} via ${domain}` : `Intelligence from ${domain}`,
            lat,
            lon,
            country,
            countryCode,
            geoPrecision,
            severity,
            timestamp: a.seendate ? parseGDELTDate(a.seendate) : new Date().toISOString(),
            url,
          }
        })
        .filter((e: IntelEvent) => e.lat !== 0 && e.lon !== 0)

      if (events.length > 5) {
        const enriched = await Promise.all(events.map(async (e) => {
          const query = extractLocationQuery(e.title, e.country !== 'Unknown' ? e.country : undefined)
          if (!query) return e
          const geo = await geocodePlace(query)
          if (!geo) return e
          return { ...e, lat: geo.lat, lon: geo.lon, country: geo.country, countryCode: geo.countryCode }
        }))
        setCache('gdelt-events', enriched, 300)
        setCache('gdelt-using-fallback', false, 300)
        return enriched
      }
    }
  } catch {
    // fall through to fallback
  }

  setCache('gdelt-events', GDELT_FALLBACK, 300)
  setCache('gdelt-using-fallback', true, 300)
  return GDELT_FALLBACK
}

function parseGDELTDate(d: string): string {
  try {
    // GDELT seendate format: "20250605T120000Z" — no dashes in date part
    const m = d.match(/^(\d{4})(\d{2})(\d{2})/)
    if (m) return new Date(`${m[1]}-${m[2]}-${m[3]}T00:00:00Z`).toISOString()
    return new Date(d).toISOString()
  } catch {
    return new Date().toISOString()
  }
}

function inferSeverity(title: string): IntelEvent['severity'] {
  const t = title.toLowerCase()
  if (/kill|dead|bomb|attack|massacre|strike|missile|explosion|war|invasion/.test(t)) return 'critical'
  if (/conflict|clash|military|troops|rebel|coup|hostage|threat/.test(t)) return 'high'
  if (/protest|tension|sanction|sanction|crisis|unrest|arrest/.test(t)) return 'medium'
  return 'low'
}

function inferCategory(title: string): IntelEvent['category'] {
  const t = title.toLowerCase()
  if (/earthquake|flood|hurricane|typhoon|cyclone|tsunami|volcano/.test(t)) return 'disaster'
  if (/wildfire|fire|blaze/.test(t)) return 'wildfire'
  if (/disease|outbreak|virus|epidemic|pandemic|health|covid|mpox/.test(t)) return 'health'
  if (/refugee|displacement|humanitarian|famine|food|aid/.test(t)) return 'humanitarian'
  if (/economy|gdp|inflation|trade|sanction|oil|gas|currency/.test(t)) return 'economic'
  if (/election|government|parliament|president|coup|protest|rally/.test(t)) return 'political'
  if (/hack|cyber|malware|ransomware|breach/.test(t)) return 'cyber'
  if (/climate|environment|emission|carbon/.test(t)) return 'environmental'
  return 'conflict'
}

const COUNTRY_GEO: Record<string, { country: string; countryCode: string; lat: number; lon: number }> = {
  ukraine: { country: 'Ukraine', countryCode: 'UA', lat: 48.5, lon: 31.0 },
  russia: { country: 'Russia', countryCode: 'RU', lat: 60.0, lon: 90.0 },
  israel: { country: 'Israel', countryCode: 'IL', lat: 31.5, lon: 34.9 },
  gaza: { country: 'Palestine', countryCode: 'PS', lat: 31.4, lon: 34.3 },
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
  'south korea': { country: 'South Korea', countryCode: 'KR', lat: 36.5, lon: 127.8 },
  india: { country: 'India', countryCode: 'IN', lat: 20.6, lon: 78.9 },
  turkey: { country: 'Turkey', countryCode: 'TR', lat: 38.9, lon: 35.2 },
  egypt: { country: 'Egypt', countryCode: 'EG', lat: 26.8, lon: 30.8 },
  libya: { country: 'Libya', countryCode: 'LY', lat: 26.3, lon: 17.2 },
  philippines: { country: 'Philippines', countryCode: 'PH', lat: 12.9, lon: 121.8 },
  haiti: { country: 'Haiti', countryCode: 'HT', lat: 18.9, lon: -72.3 },
  congo: { country: 'DR Congo', countryCode: 'CD', lat: -4.0, lon: 21.8 },
}

function inferGeoFromTitle(title: string, _domain: string): { country: string; countryCode: string; lat: number; lon: number; geoPrecision?: 'country' } {
  const t = title.toLowerCase()
  for (const [key, geo] of Object.entries(COUNTRY_GEO)) {
    if (t.includes(key)) {
      // Country centroid, no random jitter — map clustering handles overlap and
      // geoPrecision marks it as country-level (won't poison proximity correlation).
      return { ...geo, geoPrecision: 'country' }
    }
  }
  return { country: 'Unknown', countryCode: 'XX', lat: 0, lon: 0 }
}
