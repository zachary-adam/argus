import { describe, it, expect } from 'vitest'
import type { IntelEvent } from '@/types'
import {
  categoryFollow, actorFollow, locationEscalation,
  sourceSpread, cadence, evaluateManualRule, scanPatterns,
  evaluateAdvancedRule,
} from './patternRules'

// Compact factory: ISO time built from a "days+hours" offset off a fixed anchor.
const ANCHOR = new Date('2026-01-01T00:00:00Z').getTime()
const t = (dayOffset: number, hourOffset = 0) =>
  new Date(ANCHOR + dayOffset * 86_400_000 + hourOffset * 3_600_000).toISOString()

function ev(p: Partial<IntelEvent> & { id: string; category: IntelEvent['category']; timestamp: string }): IntelEvent {
  return {
    id: p.id,
    source: p.source ?? 'rss',
    category: p.category,
    title: p.title ?? p.id,
    summary: p.summary ?? '',
    lat: p.lat ?? 0,
    lon: p.lon ?? 0,
    country: p.country ?? 'Testland',
    countryCode: p.countryCode ?? 'TT',
    severity: p.severity ?? 'medium',
    timestamp: p.timestamp,
    url: p.url ?? '',
    actors: p.actors,
  } as IntelEvent
}

describe('categoryFollow', () => {
  it('detects a recurring political→humanitarian sequence', () => {
    const events: IntelEvent[] = [
      ev({ id: 'a1', category: 'political',    timestamp: t(0) }),
      ev({ id: 'a2', category: 'humanitarian', timestamp: t(0, 6) }),
      ev({ id: 'b1', category: 'political',    timestamp: t(3) }),
      ev({ id: 'b2', category: 'humanitarian', timestamp: t(3, 12) }),
      // A trigger with no follow-up — should be a miss.
      ev({ id: 'c1', category: 'political',    timestamp: t(10) }),
    ]
    const p = categoryFollow(events, 'political', 'humanitarian', 48)
    expect(p).not.toBeNull()
    expect(p!.hits).toBe(2)
    expect(p!.misses).toBe(1)
    expect(p!.hitRate).toBeCloseTo(2 / 3)
    expect(p!.source).toBe('rules')
    expect(p!.evidence.eventIds).toEqual(expect.arrayContaining(['a1', 'a2', 'b1', 'b2']))
  })

  it('returns null when the trigger never has a follow-up', () => {
    const events: IntelEvent[] = [
      ev({ id: 'x1', category: 'cyber',     timestamp: t(0) }),
      ev({ id: 'x2', category: 'cyber',     timestamp: t(2) }),
      ev({ id: 'y1', category: 'political', timestamp: t(40) }), // far outside window
    ]
    expect(categoryFollow(events, 'cyber', 'political', 24)).toBeNull()
  })

  it('refuses identical if/then categories', () => {
    const events: IntelEvent[] = [
      ev({ id: 'p1', category: 'political', timestamp: t(0) }),
      ev({ id: 'p2', category: 'political', timestamp: t(1) }),
      ev({ id: 'p3', category: 'political', timestamp: t(2) }),
    ]
    expect(categoryFollow(events, 'political', 'political', 48)).toBeNull()
  })
})

describe('actorFollow', () => {
  it('matches actors case-insensitively', () => {
    const events: IntelEvent[] = [
      ev({ id: 'r1', category: 'political', actors: [{ name: 'Group X', type: 'non-state' }], timestamp: t(0) }),
      ev({ id: 'r2', category: 'conflict',  timestamp: t(0, 12) }),
      ev({ id: 's1', category: 'political', actors: [{ name: 'GROUP X', type: 'non-state' }], timestamp: t(5) }),
      ev({ id: 's2', category: 'conflict',  timestamp: t(5, 6) }),
    ]
    const p = actorFollow(events, 'group x', 'conflict', 48)
    expect(p).not.toBeNull()
    expect(p!.hits).toBe(2)
  })
})

describe('locationEscalation', () => {
  it('flags higher-severity follow-ups in the same country', () => {
    const events: IntelEvent[] = [
      ev({ id: 'l1', category: 'political', severity: 'medium', countryCode: 'XX', timestamp: t(0) }),
      ev({ id: 'l2', category: 'conflict',  severity: 'high',   countryCode: 'XX', timestamp: t(0, 8) }),
      ev({ id: 'l3', category: 'political', severity: 'low',    countryCode: 'XX', timestamp: t(2) }),
      ev({ id: 'l4', category: 'conflict',  severity: 'critical', countryCode: 'XX', timestamp: t(2, 4) }),
    ]
    const p = locationEscalation(events, 'XX', 48)
    expect(p).not.toBeNull()
    expect(p!.hits).toBeGreaterThanOrEqual(2)
  })
})

describe('sourceSpread', () => {
  it('detects "outlet A first, outlet B follows"', () => {
    const events: IntelEvent[] = [
      ev({ id: 'src1', category: 'political', source: 'gdelt', timestamp: t(0) }),
      ev({ id: 'src2', category: 'political', source: 'rss',   timestamp: t(0, 4) }),
      ev({ id: 'src3', category: 'political', source: 'gdelt', timestamp: t(3) }),
      ev({ id: 'src4', category: 'political', source: 'rss',   timestamp: t(3, 6) }),
    ]
    const p = sourceSpread(events, 'gdelt', 'rss', 24)
    expect(p).not.toBeNull()
    expect(p!.hits).toBe(2)
  })
})

describe('cadence', () => {
  it('detects a category that clusters on specific weekdays', () => {
    // All political events fall on Mondays (2026-01-05, 12, 19, 26, Feb 02)
    const mondays = ['2026-01-05T10:00:00Z', '2026-01-12T10:00:00Z', '2026-01-19T10:00:00Z', '2026-01-26T10:00:00Z', '2026-02-02T10:00:00Z']
    const events: IntelEvent[] = mondays.map((ts, i) => ev({ id: `m${i}`, category: 'political', timestamp: ts }))
    const p = cadence(events, 'political')
    expect(p).not.toBeNull()
    expect(p!.name).toMatch(/Monday/)
  })

  it('returns null on a uniform distribution', () => {
    // 7 events, one per weekday — no clustering.
    const events: IntelEvent[] = Array.from({ length: 7 }, (_, i) =>
      ev({ id: `u${i}`, category: 'humanitarian', timestamp: t(i) }),
    )
    expect(cadence(events, 'humanitarian')).toBeNull()
  })
})

describe('evaluateManualRule', () => {
  it('returns a 0-hit pattern when the analyst hypothesis is unsupported', () => {
    const events: IntelEvent[] = [
      ev({ id: 'mz1', category: 'cyber', timestamp: t(0) }),
      ev({ id: 'mz2', category: 'cyber', timestamp: t(1) }),
    ]
    const p = evaluateManualRule(events, { ifCategory: 'cyber', thenCategory: 'economic', windowHours: 24 })
    expect(p).not.toBeNull()
    expect(p!.source).toBe('manual')
    expect(p!.hits).toBe(0)
    expect(p!.hitRate).toBe(0)
  })

  it('marks supported rules as manual', () => {
    const events: IntelEvent[] = [
      ev({ id: 'ms1', category: 'political', timestamp: t(0) }),
      ev({ id: 'ms2', category: 'humanitarian', timestamp: t(0, 4) }),
      ev({ id: 'ms3', category: 'political', timestamp: t(5) }),
      ev({ id: 'ms4', category: 'humanitarian', timestamp: t(5, 6) }),
    ]
    const p = evaluateManualRule(events, { ifCategory: 'political', thenCategory: 'humanitarian', windowHours: 24 })
    expect(p).not.toBeNull()
    expect(p!.source).toBe('manual')
    expect(p!.hits).toBe(2)
  })
})

describe('evaluateAdvancedRule', () => {
  it('handles actor → category with optional country scope', () => {
    const events: IntelEvent[] = [
      ev({ id: 'aa1', category: 'political', countryCode: 'UA', actors: [{ name: 'Group X', type: 'non-state' }], timestamp: t(0) }),
      ev({ id: 'aa2', category: 'conflict',  countryCode: 'UA', timestamp: t(0, 6) }),
      // Same actor in a different country — must be filtered out by scope.
      ev({ id: 'bb1', category: 'political', countryCode: 'RU', actors: [{ name: 'Group X', type: 'non-state' }], timestamp: t(2) }),
      ev({ id: 'bb2', category: 'conflict',  countryCode: 'RU', timestamp: t(2, 4) }),
    ]
    const p = evaluateAdvancedRule(events, {
      triggerKind: 'actor', triggerValue: 'Group X',
      followupKind: 'category', followupValue: 'conflict',
      scopeCountryCode: 'UA', windowHours: 24,
    })
    expect(p.source).toBe('manual')
    expect(p.hits).toBe(1)
    expect(p.evidence.eventIds).toEqual(expect.arrayContaining(['aa1', 'aa2']))
    expect(p.evidence.eventIds).not.toContain('bb1')
  })

  it('handles "severity escalates" follow-up', () => {
    const events: IntelEvent[] = [
      ev({ id: 'se1', category: 'political', severity: 'low',    countryCode: 'XX', timestamp: t(0) }),
      ev({ id: 'se2', category: 'conflict',  severity: 'high',   countryCode: 'XX', timestamp: t(0, 6) }),
      ev({ id: 'se3', category: 'political', severity: 'medium', countryCode: 'XX', timestamp: t(3) }),
      ev({ id: 'se4', category: 'conflict',  severity: 'critical', countryCode: 'XX', timestamp: t(3, 8) }),
    ]
    const p = evaluateAdvancedRule(events, {
      triggerKind: 'category', triggerValue: 'political',
      followupKind: 'severityEscalates',
      windowHours: 48,
    })
    expect(p.hits).toBe(2)
    expect(p.then).toMatch(/higher-severity/)
  })

  it('returns 0-hit pattern when the rule never matches', () => {
    const events: IntelEvent[] = [
      ev({ id: 'na1', category: 'cyber', timestamp: t(0) }),
      ev({ id: 'na2', category: 'cyber', timestamp: t(1) }),
    ]
    const p = evaluateAdvancedRule(events, {
      triggerKind: 'category', triggerValue: 'political',
      followupKind: 'category', followupValue: 'humanitarian',
      windowHours: 24,
    })
    expect(p.hits).toBe(0)
    expect(p.misses).toBe(0)
  })
})

describe('scanPatterns', () => {
  it('returns a deduped, sorted list of patterns from a rich corpus', () => {
    const events: IntelEvent[] = [
      ev({ id: 'q1', category: 'political',    severity: 'medium', timestamp: t(0) }),
      ev({ id: 'q2', category: 'humanitarian', severity: 'high',   timestamp: t(0, 8) }),
      ev({ id: 'q3', category: 'political',    severity: 'medium', timestamp: t(3) }),
      ev({ id: 'q4', category: 'humanitarian', severity: 'high',   timestamp: t(3, 12) }),
      ev({ id: 'q5', category: 'political',    severity: 'medium', timestamp: t(6) }),
      ev({ id: 'q6', category: 'humanitarian', severity: 'high',   timestamp: t(6, 10) }),
      ev({ id: 'q7', category: 'political',    severity: 'low',    timestamp: t(9) }),
      ev({ id: 'q8', category: 'economic',     severity: 'medium', timestamp: t(9, 5) }),
    ]
    const patterns = scanPatterns(events, { windowHours: 48 })
    expect(patterns.length).toBeGreaterThan(0)
    expect(patterns.length).toBeLessThanOrEqual(12)
    // Should be deduped on name.
    const names = new Set(patterns.map(p => p.name))
    expect(names.size).toBe(patterns.length)
  })
})
