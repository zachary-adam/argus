import { describe, it, expect } from 'vitest'
import { detectSignals, snapshotState, type MonitorInput } from './monitor'
import type { NarrativeThread } from './threads'
import type { ActorDossier } from './actors'
import type { TrackedActor } from '@/types/project'

const NOW = new Date('2026-07-07T12:00:00Z').getTime()

function thread(id: string, over: Partial<NarrativeThread> = {}): NarrativeThread {
  const events = over.events ?? [
    { id: `${id}-e1`, title: 'a', timestamp: new Date(NOW - 2 * 86_400_000).toISOString(), severity: 'high' },
    { id: `${id}-e2`, title: 'b', timestamp: new Date(NOW - 86_400_000).toISOString(), severity: 'medium' },
    { id: `${id}-e3`, title: 'c', timestamp: new Date(NOW).toISOString(), severity: 'high' },
  ]
  return {
    id, label: `Thread ${id}`, events, links: [], actorNames: [], countries: ['India'],
    categories: ['political'], topSeverity: 'high', firstAt: events[0].timestamp,
    lastAt: events[events.length - 1].timestamp, active: true, outlets: ['Reuters', 'BBC'],
    ...over,
  }
}

function actor(name: string, id = name): TrackedActor {
  return { id, name, aliases: [], type: 'organization', createdAt: '2026-01-01T00:00:00Z' }
}
function dossier(id: string, recent7: number, significant = true): ActorDossier {
  return {
    actor: actor(id, id), mentions: Array.from({ length: recent7 }, (_, i) => ({ event: { id: `${id}-m${i}`, title: 't', timestamp: new Date(NOW).toISOString(), severity: 'medium' }, matchedAs: id })),
    total: recent7, recent7, priorWeekly: 1, trendPct: 200, significant,
    severityMix: {}, categoryMix: {}, coActors: [], gradedShare: 0.5,
  }
}

const input = (threads: NarrativeThread[], dossiers: ActorDossier[] = []): MonitorInput => ({ threads, dossiers, now: NOW })

describe('detectSignals', () => {
  it('emits nothing on the first run — just baselines state', () => {
    const { signals, next } = detectSignals(null, input([thread('t1')]))
    expect(signals).toEqual([])
    expect(next.knownThreadIds).toEqual(['t1'])
  })

  it('flags a new high-severity storyline', () => {
    const { next } = detectSignals(null, input([thread('t1')]))
    const { signals } = detectSignals(next, input([thread('t1'), thread('t2')]))
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({ kind: 'new-thread', threadId: 't2', severity: 'high' })
  })

  it('does NOT flag a new low-severity or tiny thread', () => {
    const { next } = detectSignals(null, input([thread('t1')]))
    const tiny = thread('t2', { events: [{ id: 'x', title: 'a', timestamp: new Date(NOW).toISOString(), severity: 'high' }] })
    const lowSev = thread('t3', { topSeverity: 'low' })
    const { signals } = detectSignals(next, input([thread('t1'), tiny, lowSev]))
    expect(signals).toEqual([])
  })

  it('flags a thread that gained events (escalation)', () => {
    const t = thread('t1')
    const { next } = detectSignals(null, input([t]))
    const grown = thread('t1', { events: [...t.events, { id: 't1-e4', title: 'd', timestamp: new Date(NOW).toISOString(), severity: 'high' }, { id: 't1-e5', title: 'e', timestamp: new Date(NOW).toISOString(), severity: 'high' }] })
    const { signals } = detectSignals(next, input([grown]))
    expect(signals.some(s => s.kind === 'thread-escalation' && s.threadId === 't1')).toBe(true)
  })

  it('flags a dormant thread going active again', () => {
    const dormant = thread('t1', { active: false })
    const { next } = detectSignals(null, input([dormant]))
    const { signals } = detectSignals(next, input([thread('t1', { active: true })]))
    expect(signals.some(s => s.kind === 'thread-escalation')).toBe(true)
  })

  it('does not re-flag an unchanged thread', () => {
    const t = thread('t1')
    const { next } = detectSignals(null, input([t]))
    const { signals } = detectSignals(next, input([thread('t1')]))
    expect(signals).toEqual([])
  })

  it('flags a new figure contradiction within a thread', () => {
    const base = thread('t1', { events: [
      { id: 'e1', title: '3 killed in clash', timestamp: new Date(NOW - 3600_000).toISOString(), severity: 'high' },
    ] })
    const { next } = detectSignals(null, input([base]))
    const conflicted = thread('t1', { events: [
      { id: 'e1', title: '3 killed in clash', timestamp: new Date(NOW - 3600_000).toISOString(), severity: 'high' },
      { id: 'e2', title: '7 killed in clash, toll rises within hours', timestamp: new Date(NOW).toISOString(), severity: 'high' },
    ] })
    const { signals } = detectSignals(next, input([conflicted]))
    expect(signals.some(s => s.kind === 'contradiction')).toBe(true)
  })

  it('flags a significant tracked-actor spike but not a flat/insignificant one', () => {
    const { next } = detectSignals(null, input([thread('t1')], [dossier('BJP', 2)]))
    const { signals } = detectSignals(next, input([thread('t1')], [dossier('BJP', 8)]))
    expect(signals.some(s => s.kind === 'actor-spike' && s.actorId === 'BJP')).toBe(true)

    // Not significant (Poisson) → no page even if the number moved.
    const { next: n2 } = detectSignals(null, input([thread('t1')], [dossier('TMC', 2)]))
    const { signals: s2 } = detectSignals(n2, input([thread('t1')], [dossier('TMC', 8, false)]))
    expect(s2.some(s => s.kind === 'actor-spike')).toBe(false)
  })

  it('pages for a past-due unresolved forecast, even on the first run', () => {
    const forecasts = [
      { id: 'fc1', statement: 'X escalates', probability: 0.7, createdAt: '2026-01-01', dueDate: '2020-01-01' },
      { id: 'fc2', statement: 'not due yet', probability: 0.4, createdAt: '2026-01-01', dueDate: '2099-01-01' },
      { id: 'fc3', statement: 'resolved', probability: 0.6, createdAt: '2026-01-01', dueDate: '2020-01-01', resolved: true, outcome: 1 as const },
    ]
    const { signals } = detectSignals(null, { threads: [], dossiers: [], forecasts, now: NOW })
    expect(signals).toHaveLength(1)
    expect(signals[0]).toMatchObject({ kind: 'forecast-due', forecastId: 'fc1' })
  })

  it('forecast-due id is stable so the store dedups it across ticks', () => {
    const forecasts = [{ id: 'fc1', statement: 'X', probability: 0.7, createdAt: '2026-01-01', dueDate: '2020-01-01' }]
    const a = detectSignals(null, { threads: [], dossiers: [], forecasts, now: NOW })
    const b = detectSignals(a.next, { threads: [], dossiers: [], forecasts, now: NOW })
    expect(a.signals[0].id).toBe('forecast-due:fc1')
    expect(b.signals[0].id).toBe('forecast-due:fc1')
  })

  it('produces stable signal ids for dedup', () => {
    const { next } = detectSignals(null, input([thread('t1')]))
    const a = detectSignals(next, input([thread('t1'), thread('t2')])).signals
    const b = detectSignals(next, input([thread('t1'), thread('t2')])).signals
    expect(a.map(s => s.id)).toEqual(b.map(s => s.id))
  })
})

describe('snapshotState', () => {
  it('captures sizes, activity, and actor counts', () => {
    const s = snapshotState(input([thread('t1')], [dossier('BJP', 5)]))
    expect(s.threadSize.t1).toBe(3)
    expect(s.threadActive.t1).toBe(true)
    expect(s.actorRecent7.BJP).toBe(5)
  })
})
