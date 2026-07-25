import { describe, it, expect } from 'vitest'
import {
  cosineSimilarity,
  similarityToScore,
  eventEmbedText,
  buildMissionText,
  hasMissionSignal,
  scoreEventsByKeyword,
} from './semanticRelevance'

describe('cosineSimilarity', () => {
  it('is 1 for identical vectors', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 5)
  })
  it('is 0 for orthogonal vectors', () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5)
  })
  it('handles empty / mismatched lengths safely', () => {
    expect(cosineSimilarity([], [])).toBe(0)
    expect(cosineSimilarity([1, 2], [1])).toBe(0)
    expect(cosineSimilarity([0, 0], [0, 0])).toBe(0)
  })
})

describe('similarityToScore', () => {
  it('floors low similarity to 0 and ceils high to 100', () => {
    expect(similarityToScore(0.05)).toBe(0)
    expect(similarityToScore(0.9)).toBe(100)
  })
  it('is monotonic across the band', () => {
    expect(similarityToScore(0.3)).toBeGreaterThan(similarityToScore(0.2))
    expect(similarityToScore(0.5)).toBeGreaterThan(similarityToScore(0.3))
  })
})

describe('eventEmbedText', () => {
  it('combines title + summary + body and caps length', () => {
    const t = eventEmbedText({ title: 'Border clash', summary: 'Troops exchanged fire', body: 'x'.repeat(1000) })
    expect(t).toContain('Border clash')
    expect(t).toContain('Troops exchanged fire')
    expect(t.length).toBeLessThanOrEqual(600)
  })
  it('tolerates missing summary/body', () => {
    expect(eventEmbedText({ title: 'Only title' })).toBe('Only title.')
  })
})

describe('buildMissionText', () => {
  it('includes country names, place, entities and keywords', () => {
    const m = buildMissionText({
      countryCodes: ['IN', 'CN'],
      targeting: { scope: 'regional', placeName: 'Galwan Valley', watchEntities: ['PLA'], keywords: ['border', 'standoff'] },
    })
    expect(m).toMatch(/India/)
    expect(m).toMatch(/China/)
    expect(m).toMatch(/Galwan Valley/)
    expect(m).toMatch(/PLA/)
    expect(m).toMatch(/border/)
  })
  it('always carries the security framing sentence', () => {
    expect(buildMissionText({})).toMatch(/security, political, military, conflict/i)
  })
})

describe('hasMissionSignal', () => {
  it('false with no signal', () => {
    expect(hasMissionSignal({})).toBe(false)
    expect(hasMissionSignal({ targeting: { scope: 'global', keywords: [], watchEntities: [] } })).toBe(false)
  })
  it('true with any concrete signal', () => {
    expect(hasMissionSignal({ countryCodes: ['IN'] })).toBe(true)
    expect(hasMissionSignal({ researchQuestion: 'Will the standoff escalate?' })).toBe(true)
    expect(hasMissionSignal({ targeting: { scope: 'local', keywords: ['election'], watchEntities: [] } })).toBe(true)
  })
})

describe('scoreEventsByKeyword', () => {
  it('ranks entity matches above bare keywords', () => {
    const { scored, mode } = scoreEventsByKeyword([
      { id: 'a', title: 'India China trade deal signed', summary: '', category: 'economic', severity: 'low', lat: 0, lon: 0, country: 'India', countryCode: 'IN', source: 'rss', timestamp: '' },
      { id: 'b', title: 'PLA patrol near Galwan valley', summary: '', category: 'military', severity: 'high', lat: 0, lon: 0, country: 'India', countryCode: 'IN', source: 'rss', timestamp: '' },
    ], {
      targeting: { scope: 'regional', keywords: ['border'], watchEntities: ['PLA'], placeName: 'Galwan' },
      countryCodes: ['IN', 'CN'],
    })
    expect(mode).toBe('keyword')
    const byId = Object.fromEntries(scored.map(s => [s.event.id, s.score]))
    expect(byId.b).toBeGreaterThan(byId.a)
  })
})
