import { describe, it, expect } from 'vitest'
import type { IntelEvent } from '@/types'
import {
  nlqOffline,
  prefilterNlqCandidates,
  scoreACHOffline,
  suggestMissionOffline,
  generateCanvasBriefOffline,
  generateSitrepOffline,
} from './offlineIntel'

const mkEvent = (overrides: Partial<IntelEvent> & { id: string; title: string }): IntelEvent => ({
  id: overrides.id,
  title: overrides.title,
  summary: overrides.summary ?? '',
  category: overrides.category ?? 'conflict',
  country: overrides.country ?? 'India',
  countryCode: overrides.countryCode ?? 'IN',
  severity: overrides.severity ?? 'high',
  timestamp: overrides.timestamp ?? new Date().toISOString(),
  lat: overrides.lat ?? 34,
  lon: overrides.lon ?? 78,
  source: overrides.source ?? 'test',
  url: overrides.url ?? 'https://example.com',
})

describe('prefilterNlqCandidates', () => {
  const events = [
    mkEvent({ id: '1', title: 'India China border clash', country: 'India', severity: 'critical' }),
    mkEvent({ id: '2', title: 'Election in France', country: 'France', severity: 'low', category: 'political' }),
  ]

  it('filters by geography', () => {
    const out = prefilterNlqCandidates('china border last 7 days', events)
    expect(out.some(e => e.id === '1')).toBe(true)
    expect(out.some(e => e.id === '2')).toBe(false)
  })
})

describe('nlqOffline', () => {
  it('returns matching ids and offline summary', () => {
    const events = [mkEvent({ id: 'a', title: 'Ladakh patrol incident' })]
    const res = nlqOffline('ladakh conflict', events)
    expect(res.matchingIds).toContain('a')
    expect(res.summary).toMatch(/Offline mode/i)
  })
})

describe('suggestMissionOffline', () => {
  it('proposes keywords and research question for armed conflict', () => {
    const res = suggestMissionOffline({
      goalTemplateId: 'armed-conflict',
      regionName: 'South Asia',
      countryCodes: ['IN', 'CN'],
    })
    expect(res.keywords.length).toBeGreaterThan(0)
    expect(res.researchQuestion).toMatch(/\?/)
    expect(res.entities.length).toBeGreaterThan(0)
  })
})

describe('scoreACHOffline', () => {
  it('rates kinetic events as supporting escalation hypothesis', () => {
    const scores = scoreACHOffline(
      [{ id: 'h1', text: 'Fighting will intensify over the next 90 days' }],
      [{ nodeId: 'n1', title: 'Missile strike kills troops at border' }],
    )
    expect(scores[0].rating).toBe('supports')
  })
})

describe('generateCanvasBriefOffline', () => {
  it('returns structured brief without AI', () => {
    const brief = generateCanvasBriefOffline({
      projectName: 'Test',
      researchQuestion: 'Will tensions escalate?',
      regionName: 'Ladakh',
      events: [{
        title: 'Patrol clash',
        category: 'conflict',
        country: 'India',
        severity: 7,
        timestamp: new Date().toISOString(),
      }],
      achFindings: [],
      analystNotes: [],
    })
    expect(brief.headline).toMatch(/offline/i)
    expect(brief.keyFindings.length).toBeGreaterThan(0)
  })
})

describe('generateSitrepOffline', () => {
  it('produces markdown brief', () => {
    const md = generateSitrepOffline({
      focus: 'global',
      events: [mkEvent({ id: 'x', title: 'Critical incident', severity: 'critical' })],
    })
    expect(md).toMatch(/OFFLINE/)
    expect(md).toMatch(/Critical incident/)
  })
})
