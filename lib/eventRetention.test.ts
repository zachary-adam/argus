import { describe, expect, it } from 'vitest'
import {
  computeExpiresAt,
  filterIntelByRetention,
  isCuratedEvent,
  isEventExpired,
  tagEphemeralRss,
  pruneByDateFilter,
  applyKeepToIntel,
  isLiveFirehoseEvent,
  ensureIngested,
  inferKeepDuration,
  filterUniversalByRetention,
  repairProjectEventRetention,
} from './eventRetention'
import type { Project } from '@/types/project'
import type { IntelEvent } from '@/types'

const base = (over: Partial<IntelEvent> = {}): IntelEvent => ({
  id: 'e1',
  source: 'gdelt',
  category: 'political',
  title: 'Test',
  summary: '',
  lat: 0,
  lon: 0,
  country: 'X',
  countryCode: 'XX',
  severity: 'medium',
  timestamp: new Date('2026-07-01T12:00:00Z').toISOString(),
  url: '',
  ...over,
})

describe('eventRetention', () => {
  it('curated events without expiresAt never expire', () => {
    const e = base({ tags: ['added'], timestamp: '2020-01-01T00:00:00Z' })
    expect(isCuratedEvent(e)).toBe(true)
    expect(isEventExpired(e, '6h', Date.parse('2026-07-09T00:00:00Z'))).toBe(false)
  })

  it('live firehose events expire after retention window', () => {
    const e = base({ timestamp: '2026-07-08T00:00:00Z' })
    expect(isEventExpired(e, '24h', Date.parse('2026-07-09T12:00:00Z'))).toBe(true)
    expect(isEventExpired(e, '48h', Date.parse('2026-07-09T12:00:00Z'))).toBe(false)
  })

  it('expiresAt overrides curated forever', () => {
    const e = base({
      tags: ['added'],
      expiresAt: '2026-07-08T00:00:00Z',
    })
    expect(isEventExpired(e, '30d', Date.parse('2026-07-09T00:00:00Z'))).toBe(true)
  })

  it('ephemeral RSS uses 7d expiresAt from ingest', () => {
    const e = tagEphemeralRss(base({ source: 'rss', timestamp: '2026-07-01T00:00:00Z' }))
    expect(e.expiresAt).toBeDefined()
    expect(isEventExpired(e, '48h', Date.parse(e.expiresAt!) + 1000)).toBe(true)
  })

  it('filterIntelByRetention drops expired only', () => {
    const fresh = base({ id: 'fresh', timestamp: new Date().toISOString() })
    const stale = base({ id: 'stale', timestamp: '2020-01-01T00:00:00Z', ingestedAt: '2020-01-01T00:00:00Z' })
    const kept = base({ id: 'kept', tags: ['added'], timestamp: '2020-01-01T00:00:00Z' })
    const out = filterIntelByRetention([fresh, stale, kept], '48h')
    expect(out.map(e => e.id)).toEqual(['fresh', 'kept'])
  })

  it('applyKeepToIntel sets expiresAt and curated tags', () => {
    const kept = applyKeepToIntel(base(), '7d')
    expect(kept.tags).toContain('added')
    expect(kept.expiresAt).toBeDefined()
    expect(isEventExpired(kept, '48h', Date.parse(kept.expiresAt!) + 1000)).toBe(true)
  })

  it('applyKeepToIntel forever adds saved tag', () => {
    const kept = applyKeepToIntel(base(), 'forever')
    expect(kept.tags).toContain('saved')
    expect(kept.expiresAt).toBeUndefined()
  })

  it('live firehose uses ingestedAt not article timestamp', () => {
    const e = base({
      timestamp: '2020-01-01T00:00:00Z',
      ingestedAt: new Date().toISOString(),
    })
    expect(isEventExpired(e, '48h', Date.now())).toBe(false)
  })

  it('pruneByDateFilter keeps curated events', () => {
    const stale = base({ id: 'stale', timestamp: '2020-01-01T00:00:00Z', ingestedAt: '2020-01-01T00:00:00Z' })
    const kept = base({ id: 'kept', tags: ['added'], timestamp: '2020-01-01T00:00:00Z' })
    const out = pruneByDateFilter([stale, kept], '24h', Date.parse('2026-07-09T00:00:00Z'))
    expect(out.map(e => e.id)).toEqual(['kept'])
  })

  it('isLiveFirehoseEvent identifies transient SSE rows', () => {
    expect(isLiveFirehoseEvent(base())).toBe(true)
    expect(isLiveFirehoseEvent(base({ tags: ['added'] }))).toBe(false)
    expect(isLiveFirehoseEvent(tagEphemeralRss(base({ source: 'rss' })))).toBe(false)
  })

  it('computeExpiresAt returns undefined for forever', () => {
    expect(computeExpiresAt('forever')).toBeUndefined()
    expect(computeExpiresAt('7d', Date.parse('2026-07-01T00:00:00Z'))).toBe(
      new Date('2026-07-08T00:00:00Z').toISOString(),
    )
  })

  it('ensureIngested backfills ingestedAt on legacy live rows', () => {
    const stale = base({ timestamp: '2020-01-01T00:00:00Z' })
    const [fixed] = ensureIngested([stale])
    expect(fixed.ingestedAt).toBeDefined()
    expect(isEventExpired(fixed, '48h', Date.parse(fixed.ingestedAt!))).toBe(false)
  })

  it('aimed-pull with 7d expiresAt is not forever curated', () => {
    const e = applyKeepToIntel(base({ tags: ['aimed-pull'] }), '7d')
    expect(isCuratedEvent(e)).toBe(true)
    expect(isEventExpired(e, '30d', Date.parse(e.expiresAt!) + 1000)).toBe(true)
  })

  it('inferKeepDuration returns null for live firehose', () => {
    expect(inferKeepDuration(base())).toBeNull()
    expect(inferKeepDuration(applyKeepToIntel(base(), '7d'))).toBe('7d')
  })

  it('filterUniversalByRetention backfills ingestedAt on legacy project rows', () => {
    const stale = {
      id: 'u1',
      title: 'Old',
      summary: '',
      category: 'political' as const,
      lat: 0,
      lon: 0,
      country: 'X',
      countryCode: 'XX',
      locationPrecision: 'city' as const,
      actors: [],
      sources: [],
      sourceCount: 1,
      corroborationCount: 1,
      severity: 5,
      confidence: 0.7,
      dataQualityScore: 0.7,
      timestamp: '2020-01-01T00:00:00Z',
      reportedAt: '2020-01-01T00:00:00Z',
      analystComments: [],
      rawSource: 'gdelt' as const,
      projectId: 'p1',
      tags: [],
      flagged: false,
    }
    const [fixed] = filterUniversalByRetention([stale], '48h')
    expect(fixed.ingestedAt).toBeDefined()
  })

  it('repairProjectEventRetention flags journal rows and migrates legacy aimed-pull', () => {
    const p = {
      id: 'p1',
      journal: [{ id: 'j1', kind: 'event' as const, eventId: 'j-ev', savedAt: '', updatedAt: '', title: 'J' }],
      events: [
        {
          id: 'j-ev',
          title: 'Journal row',
          summary: '',
          category: 'political' as const,
          lat: 0,
          lon: 0,
          country: 'X',
          countryCode: 'XX',
          locationPrecision: 'city' as const,
          actors: [],
          sources: [],
          sourceCount: 1,
          corroborationCount: 1,
          severity: 5,
          confidence: 0.7,
          dataQualityScore: 0.7,
          timestamp: '2026-07-01T00:00:00Z',
          reportedAt: '',
          analystComments: [],
          rawSource: 'gdelt' as const,
          projectId: 'p1',
          tags: ['added'],
          flagged: false,
          expiresAt: '2026-07-08T00:00:00Z',
        },
        {
          id: 'old-aimed',
          title: 'Old pull',
          summary: '',
          category: 'political' as const,
          lat: 0,
          lon: 0,
          country: 'X',
          countryCode: 'XX',
          locationPrecision: 'city' as const,
          actors: [],
          sources: [],
          sourceCount: 1,
          corroborationCount: 1,
          severity: 5,
          confidence: 0.7,
          dataQualityScore: 0.7,
          timestamp: '2020-01-01T00:00:00Z',
          reportedAt: '',
          analystComments: [],
          rawSource: 'analyst' as const,
          projectId: 'p1',
          tags: ['aimed-pull', 'saved'],
          flagged: false,
        },
      ],
    } as Project
    const repaired = repairProjectEventRetention(p)!
    const journal = repaired.find(e => e.id === 'j-ev')!
    const aimed = repaired.find(e => e.id === 'old-aimed')!
    expect(journal.journalSaved).toBe(true)
    expect(journal.expiresAt).toBeUndefined()
    expect(aimed.expiresAt).toBeDefined()
    expect(aimed.journalSaved).toBeFalsy()
  })

  it('repairProjectEventRetention skips aimed-pull with explicit forever tag', () => {
    const p = {
      id: 'p1',
      journal: [],
      events: [{
        id: 'kept-aimed',
        title: 'Kept',
        summary: '',
        category: 'political' as const,
        lat: 0,
        lon: 0,
        country: 'X',
        countryCode: 'XX',
        locationPrecision: 'city' as const,
        actors: [],
        sources: [],
        sourceCount: 1,
        corroborationCount: 1,
        severity: 5,
        confidence: 0.7,
        dataQualityScore: 0.7,
        timestamp: '2020-01-01T00:00:00Z',
        reportedAt: '',
        analystComments: [],
        rawSource: 'analyst' as const,
        projectId: 'p1',
        tags: ['aimed-pull', 'saved', 'retention-forever'],
        flagged: false,
      }],
    } as Project
    expect(repairProjectEventRetention(p)).toBeNull()
  })

  it('applyKeepToIntel explicit forever adds retention-forever tag', () => {
    const kept = applyKeepToIntel(base({ tags: ['aimed-pull'] }), 'forever', { explicit: true })
    expect(kept.tags).toContain('retention-forever')
    expect(kept.expiresAt).toBeUndefined()
  })
})
