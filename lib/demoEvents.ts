import type { IntelEvent } from '@/types'

function fbTs(i: number): string {
  return new Date(Date.now() - (i * 900000 + Math.random() * 1800000)).toISOString()
}

/** Sample events used only when all live feeds fail (tagged `demo`). */
export const DEMO_EVENTS: IntelEvent[] = [
  { id: 's1', source: 'usgs', category: 'earthquake', title: '6.2 Magnitude Earthquake — Eastern Turkey', summary: 'USGS reports 6.2 magnitude event near Erzincan, Turkey. Damage reports emerging.', lat: 39.7, lon: 39.5, country: 'Turkey', countryCode: 'TR', severity: 'high', timestamp: fbTs(0), url: 'https://earthquake.usgs.gov' },
  { id: 's2', source: 'gdacs', category: 'disaster', title: 'Tropical Cyclone Approaching Bangladesh Coast', summary: 'GDACS Red Alert: TC intensifying in Bay of Bengal, landfall projected within 48 hours.', lat: 21.5, lon: 89.0, country: 'Bangladesh', countryCode: 'BD', severity: 'critical', timestamp: fbTs(1), url: 'https://gdacs.org' },
  { id: 's3', source: 'reliefweb', category: 'humanitarian', title: 'UNHCR: 2.1M Displaced in Sudan Crisis', summary: 'UN refugee agency reports over 2 million displaced as RSF-SAF conflict enters 13th month.', lat: 15.5, lon: 32.5, country: 'Sudan', countryCode: 'SD', severity: 'critical', timestamp: fbTs(2), url: 'https://reliefweb.int' },
  { id: 's4', source: 'who', category: 'health', title: 'WHO Outbreak Alert: Mpox Cluster in DRC', summary: 'WHO reports new clade Ib mpox cluster detected in eastern Democratic Republic of Congo.', lat: -1.5, lon: 29.0, country: 'DR Congo', countryCode: 'CD', severity: 'high', timestamp: fbTs(3), url: 'https://who.int' },
  { id: 's5', source: 'ucdp', category: 'conflict', title: 'Ethiopia: Amhara-Federal Forces Clash Near Bahir Dar', summary: 'FANO militia and Ethiopian National Defence Forces exchange fire near regional capital.', lat: 11.6, lon: 37.4, country: 'Ethiopia', countryCode: 'ET', severity: 'high', timestamp: fbTs(4), url: 'https://ucdp.uu.se', fatalities: 23 },
  { id: 's6', source: 'gdelt', category: 'conflict', title: 'Ukraine: Russian Missile Barrage Targets Power Grid', summary: 'Russian forces launch coordinated missile attack on Ukrainian energy infrastructure across 5 oblasts.', lat: 50.4, lon: 30.5, country: 'Ukraine', countryCode: 'UA', severity: 'critical', timestamp: fbTs(5), url: 'https://gdeltproject.org', fatalities: 9 },
  { id: 's7', source: 'rss', category: 'political', title: 'North Korea Tests ICBM — Flies Over Japan', summary: 'DPRK ballistic missile overflies Japanese archipelago; Japan issues J-Alert nationwide.', lat: 40.3, lon: 127.5, country: 'North Korea', countryCode: 'KP', severity: 'critical', timestamp: fbTs(6), url: 'https://www.bbc.com/news' },
  { id: 's8', source: 'gdelt', category: 'conflict', title: 'Gaza: IDF Ground Operations Continue in Rafah', summary: 'Israeli Defence Forces continue offensive in Rafah; humanitarian access severely restricted.', lat: 31.3, lon: 34.2, country: 'Palestine', countryCode: 'PS', severity: 'critical', timestamp: fbTs(7), url: 'https://gdeltproject.org', fatalities: 67 },
  { id: 's9', source: 'ucdp', category: 'conflict', title: 'Mali: Wagner-Affiliated Forces Attack Timbuktu', summary: 'Armed group linked to Africa Corps conducts operation near Timbuktu; MINUSMA successor mission responds.', lat: 16.8, lon: -3.0, country: 'Mali', countryCode: 'ML', severity: 'high', timestamp: fbTs(8), url: 'https://ucdp.uu.se', fatalities: 15 },
  { id: 's10', source: 'gdelt', category: 'political', title: 'Iran: Protests Erupt Following Fuel Price Hike', summary: 'Mass demonstrations across Tehran, Isfahan, and Mashhad following 40% fuel subsidy cut.', lat: 35.7, lon: 51.4, country: 'Iran', countryCode: 'IR', severity: 'high', timestamp: fbTs(9), url: 'https://gdeltproject.org' },
  { id: 's11', source: 'reliefweb', category: 'humanitarian', title: 'Yemen: Famine Conditions in 3 Governorates — WFP', summary: 'WFP declares famine conditions in Hadramawt, Al Jawf, and Marib governorates.', lat: 15.9, lon: 44.2, country: 'Yemen', countryCode: 'YE', severity: 'critical', timestamp: fbTs(10), url: 'https://reliefweb.int' },
  { id: 's12', source: 'usgs', category: 'earthquake', title: '5.8 Earthquake — Philippines Mindanao', summary: 'USGS records 5.8 magnitude event near Davao, Mindanao island. No tsunami warning issued.', lat: 7.2, lon: 125.4, country: 'Philippines', countryCode: 'PH', severity: 'medium', timestamp: fbTs(11), url: 'https://earthquake.usgs.gov' },
  { id: 's13', source: 'gdelt', category: 'conflict', title: 'Myanmar: SAC Airstrike on Resistance-Held Town', summary: 'Tatmadaw airstrike on Demoso township, Kayah State. PDF claims 30+ civilian casualties.', lat: 19.3, lon: 97.1, country: 'Myanmar', countryCode: 'MM', severity: 'critical', timestamp: fbTs(12), url: 'https://gdeltproject.org', fatalities: 31 },
  { id: 's14', source: 'rss', category: 'political', title: 'Venezuela: Maduro Arrests Opposition Candidates', summary: 'Venezuelan authorities arrest three opposition presidential candidates weeks before scheduled elections.', lat: 10.5, lon: -66.9, country: 'Venezuela', countryCode: 'VE', severity: 'high', timestamp: fbTs(13), url: 'https://www.bbc.com/news' },
  { id: 's15', source: 'gdelt', category: 'conflict', title: 'Somalia: Al-Shabaab Sieges Beledweyne', summary: 'Al-Shabaab forces encircle Hirshabelle state capital; AMISOM units in defensive posture.', lat: 4.7, lon: 45.2, country: 'Somalia', countryCode: 'SO', severity: 'critical', timestamp: fbTs(14), url: 'https://gdeltproject.org', fatalities: 22 },
]

export function isDemoEvent(e: Pick<IntelEvent, 'tags'>): boolean {
  return e.tags?.includes('demo') === true
}

export function tagDemoEvents(events: IntelEvent[]): IntelEvent[] {
  return events.map((e, i) => ({
    ...e,
    source_detail: 'DEMO — no live data available',
    tags: [...new Set([...(e.tags ?? []), 'demo'])],
    timestamp: new Date(Date.now() - (i * 900000 + Math.random() * 1800000)).toISOString(),
  }))
}

/** Sparse historical echoes for anomaly baseline when the live cache is cold. */
export function demoEventsWithHistory(): IntelEvent[] {
  const synthetic: IntelEvent[] = []
  const now = Date.now()
  const histOffsets = [25, 55, 85]
  for (const ev of DEMO_EVENTS) {
    synthetic.push({ ...ev, tags: ['demo', 'baseline'] })
    for (const daysBack of histOffsets) {
      const jitterMs = (Math.random() - 0.5) * 12 * 3600 * 1000
      synthetic.push({
        ...ev,
        id: `${ev.id}-h${daysBack}`,
        severity: 'low',
        tags: ['demo', 'baseline'],
        timestamp: new Date(now - daysBack * 86400000 + jitterMs).toISOString(),
      })
    }
  }
  return synthetic
}
