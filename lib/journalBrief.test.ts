import { describe, expect, it } from 'vitest'
import type { IntelEvent } from '@/types'
import type { Project } from '@/types/project'
import {
  BRIEF_BLENDED_SUPPLEMENTAL_CAP,
  BRIEF_LIVE_CAP,
  capBriefEvents,
  resolveBriefEvents,
} from '@/lib/journalBrief'
import { buildProjectBriefPayload } from '@/lib/briefPayload'

function live(id: string): IntelEvent {
  return {
    id,
    title: `Live ${id}`,
    summary: '',
    category: 'political',
    severity: 'medium',
    lat: 1,
    lon: 2,
    country: 'Test',
    countryCode: 'TS',
    source: 'gdelt',
    url: '',
    timestamp: '2026-01-01T00:00:00Z',
  }
}

function project(overrides: Partial<Project> = {}): Project {
  return {
    id: 'p1',
    name: 'Test',
    regionName: 'Region',
    regionCenter: [0, 0],
    regionZoom: 4,
    countryCodes: [],
    events: [],
    plots: [],
    predictionLedger: [],
    connectors: [],
    formulaWeightOverrides: {},
    incidents: [],
    watchRules: [],
    aiMode: 'none',
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
    lastOpenedAt: '2026-01-01',
    ...overrides,
  }
}

describe('resolveBriefEvents', () => {
  it('returns merged live + project events in live mode', () => {
    const p = project({ briefEvidenceMode: 'live' })
    const out = resolveBriefEvents(p, [live('a'), live('b')], 'live')
    expect(out.map(e => e.id).sort()).toEqual(['a', 'b'])
  })

  it('caps live mode at BRIEF_LIVE_CAP', () => {
    const many = Array.from({ length: BRIEF_LIVE_CAP + 20 }, (_, i) => live(`e${i}`))
    const p = project({ briefEvidenceMode: 'live' })
    expect(resolveBriefEvents(p, many, 'live')).toHaveLength(BRIEF_LIVE_CAP)
  })

  it('returns only curated journal events in curated mode', () => {
    const p = project({
      briefEvidenceMode: 'curated',
      journal: [{
        id: 'j1',
        kind: 'event',
        eventId: 'saved',
        title: 'Saved',
        savedAt: '2026-01-01',
        updatedAt: '2026-01-01',
        lat: 3,
        lon: 4,
      }],
    })
    const out = resolveBriefEvents(p, [live('noise'), live('saved')], 'curated')
    expect(out.map(e => e.id)).toEqual(['saved'])
  })

  it('returns empty in curated mode when journal has no events', () => {
    const p = project({
      briefEvidenceMode: 'curated',
      journal: [{
        id: 'j1',
        kind: 'paper',
        title: 'Paper only',
        savedAt: '2026-01-01',
        updatedAt: '2026-01-01',
      }],
    })
    expect(resolveBriefEvents(p, [live('noise')], 'curated')).toEqual([])
  })

  it('blends curated first then capped supplemental live events', () => {
    const p = project({
      briefEvidenceMode: 'blended',
      journal: [{
        id: 'j1',
        kind: 'event',
        eventId: 'saved',
        title: 'Saved',
        savedAt: '2026-01-01',
        updatedAt: '2026-01-01',
        lat: 3,
        lon: 4,
      }],
    })
    const supplemental = Array.from({ length: BRIEF_BLENDED_SUPPLEMENTAL_CAP + 5 }, (_, i) => live(`x${i}`))
    const out = resolveBriefEvents(p, [live('saved'), ...supplemental], 'blended')
    expect(out[0].id).toBe('saved')
    expect(out).toHaveLength(1 + BRIEF_BLENDED_SUPPLEMENTAL_CAP)
  })
})

describe('capBriefEvents', () => {
  it('prefers critical severity', () => {
    const events = [
      { ...live('low'), severity: 'low' as const },
      { ...live('crit'), severity: 'critical' as const },
    ]
    expect(capBriefEvents(events, 1)[0].id).toBe('crit')
  })
})

describe('buildProjectBriefPayload', () => {
  it('uses curated events when briefEvidenceMode is curated', () => {
    const p = project({
      briefEvidenceMode: 'curated',
      journal: [{
        id: 'j1',
        kind: 'event',
        eventId: 'saved',
        title: 'Saved',
        savedAt: '2026-01-01',
        updatedAt: '2026-01-01',
        lat: 3,
        lon: 4,
      }],
    })
    const payload = buildProjectBriefPayload(p, {
      events: [live('noise'), live('saved')],
      alerts: [],
      situations: [],
      flaggedAlerts: {},
    }, [])
    expect(payload.events.map(e => e.id)).toEqual(['saved'])
    expect(payload.curatedEvidence).toBeTruthy()
  })
})
