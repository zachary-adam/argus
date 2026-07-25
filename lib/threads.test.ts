import { describe, it, expect } from 'vitest'
import { deriveThreads, threadBriefBlock, type ThreadEvent } from './threads'
import type { TrackedActor } from '@/types/project'

const NOW = new Date('2026-07-06T12:00:00Z').getTime()

function actor(name: string, aliases: string[] = [], id = name): TrackedActor {
  return { id, name, aliases, type: 'organization', createdAt: '2026-01-01T00:00:00Z' }
}

function ev(id: string, title: string, daysAgo: number, extra: Partial<ThreadEvent> = {}): ThreadEvent {
  return {
    id,
    title,
    timestamp: new Date(NOW - daysAgo * 86_400_000).toISOString(),
    severity: 'medium',
    country: 'India',
    category: 'political',
    lat: 22.57,
    lon: 88.36,
    source: 'rss',
    ...extra,
  }
}

const tmc = actor('Trinamool Congress', ['TMC'])
const bjp = actor('BJP', [], 'a-bjp')

describe('deriveThreads', () => {
  it('links events that share a tracked actor into one thread', () => {
    const events = [
      ev('e1', 'TMC symbol dispute reaches Election Commission', 6),
      ev('e2', 'TMC rebel faction claims party symbol in Delhi', 4),
      ev('e3', 'Cyclone forms over Bay of Bengal', 5, { category: 'environmental', lat: 18.0, lon: 89.0, country: 'India' }),
    ]
    const threads = deriveThreads(events, [tmc], { now: NOW })
    expect(threads).toHaveLength(1)
    expect(threads[0].events.map(e => e.id)).toEqual(['e1', 'e2'])
    expect(threads[0].actorNames).toContain('Trinamool Congress')
  })

  it('records an audit trail for every joined event', () => {
    const events = [
      ev('e1', 'TMC symbol dispute reaches Election Commission', 6),
      ev('e2', 'TMC rebel faction presses symbol claim', 4),
    ]
    const [t] = deriveThreads(events, [tmc], { now: NOW })
    expect(t.links.find(l => l.eventId === 'e1')?.reasons).toEqual(['thread origin'])
    const joined = t.links.find(l => l.eventId === 'e2')?.reasons ?? []
    expect(joined).toContain('actor: Trinamool Congress')
  })

  it('does not merge on weak signals alone (same country + category)', () => {
    const events = [
      ev('e1', 'Fuel prices protested in Chennai', 6, { lat: 13.08, lon: 80.27 }),
      ev('e2', 'Assembly session opens in Shimla', 4, { lat: 31.1, lon: 77.17 }),
    ]
    expect(deriveThreads(events, [], { now: NOW })).toHaveLength(0) // two singletons
  })

  it('does not glue unrelated national stories by geography alone (centroid pileup)', () => {
    // Same country, same category, identical anchor coords — but no shared actor
    // and no related reporting. Circumstance must not form a storyline.
    const events = [
      ev('e1', 'Jet fuel price increased to Rs 115 per litre', 6),
      ev('e2', 'State polls deepen political divide, results show', 4),
      ev('e3', 'Intelligence ambitions clouded by assassination plot', 2),
    ]
    expect(deriveThreads(events, [], { now: NOW })).toHaveLength(0)
  })

  it('links related reporting near the same place without actors', () => {
    const events = [
      ev('e1', 'Clashes erupt in Baruipur after murder of minor', 5, { lat: 22.36, lon: 88.43, category: 'conflict' }),
      ev('e2', 'Baruipur clashes: curfew imposed after murder protests', 4, { lat: 22.36, lon: 88.44, category: 'conflict' }),
    ]
    const threads = deriveThreads(events, [], { now: NOW })
    expect(threads).toHaveLength(1)
    const joined = threads[0].links.find(l => l.eventId === 'e2')?.reasons ?? []
    expect(joined).toContain('related reporting')
    expect(joined).toContain('nearby location')
  })

  it('breaks threads on long time gaps', () => {
    const events = [
      ev('e1', 'TMC rally in Kolkata', 40),
      ev('e2', 'TMC rally announced again in Kolkata', 2),
    ]
    expect(deriveThreads(events, [tmc], { now: NOW })).toHaveLength(0) // gap > 14d → two singletons
  })

  it('derives label, activity, severity, and outlets', () => {
    const events = [
      ev('e1', 'TMC symbol dispute reaches Election Commission', 6, { source_detail: 'Anandabazar' }),
      ev('e2', 'TMC rebel faction presses symbol claim', 4, { severity: 'high', source_detail: 'The Hindu' }),
    ]
    const [t] = deriveThreads(events, [tmc, bjp], { now: NOW })
    expect(t.label).toBe('Trinamool Congress · India · political')
    expect(t.active).toBe(true)
    expect(t.topSeverity).toBe('high')
    expect(t.outlets).toEqual(['Anandabazar', 'The Hindu'])
    expect(t.firstAt < t.lastAt).toBe(true)
  })

  it('threadBriefBlock anchors storylines to exact [E#] corpus positions', () => {
    const corpus = [
      ev('e1', 'TMC symbol dispute reaches Election Commission', 6),
      ev('e2', 'Unrelated flood coverage', 5, { category: 'environmental', lat: 10, lon: 76 }),
      ev('e3', 'TMC rebel faction presses symbol claim', 4),
    ]
    const block = threadBriefBlock(corpus, [tmc], NOW)
    expect(block).toContain('NARRATIVE THREADS')
    expect(block).toContain('[E1][E3]')
    expect(block).toContain('ACTIVE')
    expect(threadBriefBlock([], [tmc], NOW)).toBe('')
  })

  it('is deterministic — same corpus, same threads', () => {
    const events = [
      ev('e1', 'TMC symbol dispute reaches Election Commission', 6),
      ev('e2', 'TMC rebel faction presses symbol claim', 4),
      ev('e3', 'BJP announces Bengal candidate list', 3),
      ev('e4', 'BJP infighting over Bengal candidate list', 2),
    ]
    const a = deriveThreads(events, [tmc, bjp], { now: NOW })
    const b = deriveThreads([...events].reverse(), [tmc, bjp], { now: NOW })
    expect(a.map(t => t.id)).toEqual(b.map(t => t.id))
    expect(a.map(t => t.events.map(e => e.id))).toEqual(b.map(t => t.events.map(e => e.id)))
  })
})
