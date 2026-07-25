import { describe, it, expect } from 'vitest'
import { buildNewsQuery, googleNewsUrl, parseGoogleNews } from './googleNews'

describe('query-driven (aimed) ingestion', () => {
  describe('buildNewsQuery', () => {
    it('anchors a city token to a high-recall OR-group of entities + keywords', () => {
      const q = buildNewsQuery({ placeName: 'Kibera, Nairobi', keywords: ['election', 'violence'], watchEntities: ['ODM', 'Ruto'] })
      // City token only (drops ", Nairobi") to preserve recall.
      expect(q).toContain('"Kibera"')
      expect(q).not.toContain('Nairobi')
      // Entities AND keywords are OR-ed into one group so any single term qualifies.
      expect(q).toContain('ODM OR Ruto OR election OR violence')
    })
    it('quotes multi-word terms but leaves single words bare', () => {
      const q = buildNewsQuery({ placeName: 'Taipei', keywords: ['naval blockade', 'missile'], watchEntities: [] })
      expect(q).toContain('"naval blockade"')
      expect(q).toContain('missile')
      expect(q).not.toContain('"missile"')
    })
    it('works with just a place (hyper-local with no keywords)', () => {
      expect(buildNewsQuery({ placeName: 'Kibera', keywords: [], watchEntities: [] })).toBe('"Kibera"')
    })
    it('expands multi-word places so neighbourhood suffixes do not starve recall', () => {
      const q = buildNewsQuery({
        placeName: 'Jamia Nagar, Delhi',
        keywords: ['election'],
        watchEntities: [],
      })
      expect(q.toLowerCase()).toContain('jamia')
      expect(q.toLowerCase()).toContain('jamia nagar')
      expect(q).toContain(' OR ')
      expect(q).toContain('election')
    })
    it('is empty when nothing is aimed', () => {
      expect(buildNewsQuery({ keywords: [], watchEntities: [] })).toBe('')
    })
  })

  it('googleNewsUrl time-bounds and encodes', () => {
    const url = googleNewsUrl('"Kibera" election', 3)
    expect(url).toContain('news.google.com/rss/search')
    expect(url).toContain(encodeURIComponent('when:3d'))
  })

  describe('parseGoogleNews', () => {
    const geo = { lat: -1.31, lon: 36.78, country: 'Kenya', countryCode: 'KE' }
    const xml = `<rss><channel>
      <item><title>Tension rises in Kibera ahead of by-election</title><link>https://x.test/1</link><pubDate>Mon, 15 Jun 2026 09:00:00 GMT</pubDate><source url="https://nation.africa">Daily Nation</source></item>
      <item><title><![CDATA[Police deploy to Kibera polling stations]]></title><link>https://x.test/2</link><pubDate>Mon, 15 Jun 2026 10:00:00 GMT</pubDate></item>
    </channel></rss>`

    it('parses items, anchors them at the focus place, tags them targeted', () => {
      const events = parseGoogleNews(xml, geo)
      expect(events).toHaveLength(2)
      expect(events[0].lat).toBeCloseTo(-1.31, 2)
      expect(events[0].country).toBe('Kenya')
      expect(events[0].geoPrecision).toBe('city')
      expect(events[0].tags).toContain('targeted')
      expect(events[0].tags).toContain('aimed-pull')
      expect(events[0].tags).toContain('google-news')
      expect(events[0].source).toBe('analyst')
    })

    it('gives content-stable ids so refetches dedupe (no Date.now)', () => {
      const a = parseGoogleNews(xml, geo)
      const b = parseGoogleNews(xml, geo)
      expect(a[0].id).toBe(b[0].id)
      expect(a[0].id).not.toBe(a[1].id)
    })

    it('handles CDATA titles', () => {
      const events = parseGoogleNews(xml, geo)
      expect(events[1].title).toContain('Police deploy to Kibera')
    })
  })
})
