import { describe, it, expect } from 'vitest'
import { matchActor, deriveDossier, deriveAllDossiers, suggestActors, suggestAcronym, makeTrackedActor, actorBriefBlock } from './actors'
import type { TrackedActor } from '@/types/project'
import type { ActorEvent } from './actors'

const NOW = new Date('2026-07-05T12:00:00Z').getTime()

function actor(name: string, aliases: string[] = [], id = name): TrackedActor {
  return { id, name, aliases, type: 'organization', createdAt: '2026-01-01T00:00:00Z' }
}

function ev(id: string, title: string, daysAgo: number, extra: Partial<ActorEvent> = {}): ActorEvent {
  return {
    id,
    title,
    timestamp: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    severity: 'medium',
    ...extra,
  }
}

describe('matchActor', () => {
  const tmc = actor('Trinamool Congress', ['TMC', 'তৃণমূল'])

  it('matches canonical name and Latin aliases on word boundaries', () => {
    expect(matchActor(tmc, 'Trinamool Congress leader arrested')).toBe('Trinamool Congress')
    expect(matchActor(tmc, 'TMC rebels reach Delhi')).toBe('TMC')
    expect(matchActor(tmc, 'utmost caution urged')).toBeNull()      // no substring hit on "TMC"
    expect(matchActor(tmc, 'the tmc faction')).toBe('TMC')          // case-insensitive
  })

  it('matches non-Latin aliases by substring', () => {
    expect(matchActor(tmc, 'তৃণমূল কার? মমতা ও ঋতব্রত দুই শিবির')).toBe('তৃণমূল')
  })

  it('ignores empty text and short terms', () => {
    expect(matchActor(tmc, '')).toBeNull()
    expect(matchActor(actor('X', []), 'X marks the spot')).toBeNull() // 1-char name skipped
  })
})

describe('deriveDossier', () => {
  const bjp = actor('Bharatiya Janata Party', ['BJP'], 'a-bjp')
  const eci = actor('Election Commission of India', ['ECI'], 'a-eci')

  const events: ActorEvent[] = [
    ev('e1', 'BJP announces candidate list', 1, { severity: 'low', category: 'political', sourceReliability: 'A' }),
    ev('e2', 'Clash at BJP rally injures four', 3, { severity: 'high', category: 'conflict', sourceReliability: 'C' }),
    ev('e3', 'ECI reviews BJP complaint over booths', 5, { severity: 'medium', category: 'elections', sourceReliability: 'B' }),
    ev('e4', 'Bharatiya Janata Party wins by-election', 15, { severity: 'low', category: 'political' }),
    ev('e5', 'Unrelated flood coverage', 2),
  ]

  it('collects mentions with the matched term, newest first', () => {
    const d = deriveDossier(bjp, events, [bjp, eci], NOW)
    expect(d.total).toBe(4)
    expect(d.mentions.map(m => m.event.id)).toEqual(['e1', 'e2', 'e3', 'e4'])
    expect(d.mentions[3].matchedAs).toBe('Bharatiya Janata Party')
    expect(d.mentions[0].matchedAs).toBe('BJP')
  })

  it('computes trend vs the prior 23-day baseline', () => {
    const d = deriveDossier(bjp, events, [], NOW)
    expect(d.recent7).toBe(3)
    expect(d.priorWeekly).toBeCloseTo((1 / 23) * 7, 1)
    expect(d.trendPct).toBeGreaterThan(100)
  })

  it('reports severity/category mix and graded share', () => {
    const d = deriveDossier(bjp, events, [], NOW)
    expect(d.severityMix).toEqual({ low: 2, high: 1, medium: 1 })
    expect(d.categoryMix.political).toBe(2)
    expect(d.gradedShare).toBe(0.5) // e1 (A) + e3 (B) of 4
  })

  it('finds co-actors through shared events', () => {
    const d = deriveDossier(bjp, events, [bjp, eci], NOW)
    expect(d.coActors).toHaveLength(1)
    expect(d.coActors[0].actor.id).toBe('a-eci')
    expect(d.coActors[0].shared).toBe(1) // e3
  })

  it('is honest about an unmentioned actor', () => {
    const ghost = actor('Nonexistent Front', [], 'a-ghost')
    const d = deriveDossier(ghost, events, [], NOW)
    expect(d.total).toBe(0)
    expect(d.trendPct).toBe(0)
    expect(d.firstSeen).toBeUndefined()
  })
})

describe('deriveAllDossiers', () => {
  it('ranks by recent activity', () => {
    const a = actor('Alpha Party', [], 'a1')
    const b = actor('Beta Front', [], 'b1')
    const events = [
      ev('e1', 'Beta Front stages march', 1),
      ev('e2', 'Beta Front leader speaks', 2),
      ev('e3', 'Alpha Party files papers', 20),
    ]
    const ds = deriveAllDossiers([a, b], events, NOW)
    expect(ds[0].actor.id).toBe('b1')
    expect(ds[1].actor.id).toBe('a1')
  })
})

describe('suggestActors', () => {
  it('offers watch entities first, then frequent structured actors, minus tracked', () => {
    const tracked = [actor('Trinamool Congress', ['TMC'])]
    const events: ActorEvent[] = [
      ev('e1', 't', 1, { actors: [{ name: 'BJP' }, { name: 'TMC' }] }),
      ev('e2', 't', 2, { actors: [{ name: 'BJP' }] }),
      ev('e3', 't', 3, { actors: [{ name: 'One-off Group' }] }),
    ]
    const s = suggestActors(events, { watchEntities: ['Election Commission', 'TMC'] }, tracked)
    expect(s.map(x => x.name)).toEqual(['Election Commission', 'BJP'])
    expect(s[0].source).toBe('watchlist')
    expect(s[1].count).toBe(2)
  })
})

describe('actorBriefBlock', () => {
  const tmc = actor('Trinamool Congress', ['TMC'], 'a-tmc')
  const eci = actor('Election Commission of India', ['ECI'], 'a-eci')
  const corpus: ActorEvent[] = [
    ev('e1', 'TMC leader arrested in Kolkata', 1, { severity: 'high' }),
    ev('e2', 'Flood relief in Assam', 2),
    ev('e3', 'Trinamool Congress rally draws thousands', 3, { severity: 'medium' }),
  ]

  it('anchors every mention to the exact [E#] position in the ordered corpus', () => {
    const block = actorBriefBlock([tmc], corpus, NOW)
    expect(block).toContain('Trinamool Congress (organization): 2 corpus mentions [E1][E3]')
    expect(block).toContain('2 in last 7d')
    expect(block).toContain('top severity high')
  })

  it('lists zero-mention actors as a collection gap instead of dropping them', () => {
    const block = actorBriefBlock([tmc, eci], corpus, NOW)
    expect(block).toContain('No corpus mentions: Election Commission of India')
    expect(block).toContain('collection gap')
  })

  it('returns empty string when nothing to say', () => {
    expect(actorBriefBlock([], corpus, NOW)).toBe('')
    expect(actorBriefBlock([tmc], [], NOW)).toBe('')
  })
})

describe('acronym + factory', () => {
  it('suggests acronyms for multi-word proper names only', () => {
    expect(suggestAcronym('Election Commission of India')).toBe('ECI')
    expect(suggestAcronym('Trinamool Congress')).toBe('TC')
    expect(suggestAcronym('police')).toBeNull()
  })

  it('makeTrackedActor seeds the acronym alias', () => {
    const a = makeTrackedActor('Election Commission of India', 'organization')
    expect(a.aliases).toEqual(['ECI'])
    expect(a.type).toBe('organization')
  })
})
