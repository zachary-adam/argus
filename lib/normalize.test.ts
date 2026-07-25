import { describe, it, expect } from 'vitest'
import { extractLocation, deduplicateEvents, NormalizedEvent } from './normalize'

describe('extractLocation — word-boundary matching', () => {
  it('does NOT match a gazetteer key that is only a substring of another word', () => {
    // Regression: "climate" used to resolve to Lima, Peru because includes('lima').
    const loc = extractLocation("Who warned of 'climate instability' in 1988?")
    expect(loc.name).toBe('Unknown')
    expect(loc.country).toBeUndefined()
  })

  it('does NOT match "hama" inside "Hamas"', () => {
    const loc = extractLocation('Hamas releases new statement on negotiations')
    expect(loc.country).not.toBe('SY')
  })

  it('still resolves a real place mentioned as a whole word', () => {
    const loc = extractLocation('Heavy fighting reported near El Fasher in Darfur')
    expect(loc.country).toBe('SD')
    // longest key wins: "el fasher" over "darfur"
    expect(loc.name).toBe('El Fasher')
  })

  it('prefers the longest (most specific) matching key', () => {
    const loc = extractLocation('Aid convoy reaches South Sudan amid crisis')
    expect(loc.name).toBe('South Sudan')
    expect(loc.country).toBe('SS')
  })

  it('resolves multi-word keys and is case-insensitive', () => {
    const loc = extractLocation('TENSIONS RISE IN HONG KONG')
    expect(loc.country).toBe('HK')
  })

  it('does not match the removed bare "port" key as a generic English word', () => {
    // Regression: bare "port" key used to plot any "port" headline in Haiti.
    const loc = extractLocation('New deep-water port opens to boost exports')
    expect(loc.country).not.toBe('HT')
  })

  it('returns Unknown when no known place is present', () => {
    expect(extractLocation('Quarterly earnings beat expectations').name).toBe('Unknown')
  })
})

describe('deduplicateEvents', () => {
  const mk = (title: string, url: string): NormalizedEvent => ({
    id: crypto.randomUUID(), title, description: '', timestamp: new Date().toISOString(),
    location: { name: 'Unknown' }, actors: [], categories: ['political'], severity: 'medium',
    source: { name: 's', type: 'independent', url, credibility: 80 },
  })

  it('drops exact URL duplicates', () => {
    const existing = [mk('A', 'http://x/1')]
    const out = deduplicateEvents([mk('Totally different headline', 'http://x/1')], existing)
    expect(out).toHaveLength(0)
  })

  it('keeps genuinely distinct events', () => {
    const existing = [mk('Flood hits coastal town', 'http://x/1')]
    const out = deduplicateEvents([mk('Central bank raises interest rates', 'http://x/2')], existing)
    expect(out).toHaveLength(1)
  })
})
